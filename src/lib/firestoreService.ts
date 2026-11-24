import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  DEPARTMENT_ID,
  Project,
  ProjectStatus,
  RoleCode,
  ReviewResult,
  SubmissionStatus,
  SystemConfig,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UserProfile,
  WorkGroup,
} from '../types/domain';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { buildParticipantIds } from './rbac';
import { dateStrToNum, getVietnamNowParts } from './time';

export function sanitizeEmailId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export async function logSystemAudit(params: {
  actor: UserProfile;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  allUsers: UserProfile[];
}): Promise<void> {
  const id = makeId('aud');
  const viewerIds = Array.from(
    new Set([
      params.actor.uid,
      ...params.allUsers
        .filter((u) => u.roles.includes('ADMIN') || u.roles.includes('TRUONG_PHONG') || u.roles.includes('PHO_PHONG'))
        .map((u) => u.uid),
    ])
  ).slice(0, 30);

  try {
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      actorId: params.actor.uid,
      actorName: params.actor.fullName,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      detail: params.detail.slice(0, 1000),
      viewerIds,
      departmentId: DEPARTMENT_ID,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `auditLogs/${id}`);
  }
}

export async function logTaskAudit(params: {
  taskId: string;
  actor: UserProfile;
  action: string;
  detail: string;
  participantIds: string[];
}): Promise<void> {
  const id = makeId('taud');
  try {
    await setDoc(doc(db, 'tasks', params.taskId, 'auditLogs', id), {
      id,
      actorId: params.actor.uid,
      actorName: params.actor.fullName,
      action: params.action,
      detail: params.detail.slice(0, 1000),
      taskParticipantIds: params.participantIds.slice(0, 50),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tasks/${params.taskId}/auditLogs/${id}`);
  }
}

export async function resolveOrBootstrapCurrentUser(): Promise<{
  profile: UserProfile | null;
  status: 'OK' | 'LOCKED' | 'NOT_INVITED';
}> {
  const current = auth.currentUser;
  if (!current) return { profile: null, status: 'NOT_INVITED' };

  const uid = current.uid;
  const email = (current.email || '').toLowerCase();

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      if (!data.isActive) {
        return { profile: data, status: 'LOCKED' };
      }
      return { profile: { ...data, email }, status: 'OK' };
    }

    // Check if user is the bootstrapped admin email
    if (email === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
      const adminProfile: Omit<UserProfile, 'email'> = {
        uid,
        authUid: uid,
        employeeCode: 'AD-01',
        fullName: current.displayName || 'Quản trị viên Phòng ban',
        title: 'Trưởng phòng / Quản trị hệ thống',
        roles: ['ADMIN', 'TRUONG_PHONG'],
        groupId: 'grp_1',
        managerId: uid,
        isActive: true,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      batch.set(userRef, adminProfile);
      batch.set(doc(db, 'users', uid, 'private', 'info'), {
        uid,
        authUid: uid,
        email,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        profile: { ...adminProfile, email } as UserProfile,
        status: 'OK',
      };
    }

    // Otherwise check invites/{sanitizedEmail}
    if (email) {
      const inviteId = sanitizeEmailId(email);
      const inviteSnap = await getDoc(doc(db, 'invites', inviteId));
      if (inviteSnap.exists()) {
        const inv = inviteSnap.data() as {
          roles: RoleCode[];
          groupId?: string;
          managerId?: string;
          fullName: string;
          employeeCode: string;
          title?: string;
          isActive: boolean;
        };
        if (!inv.isActive) {
          return { profile: null, status: 'LOCKED' };
        }
        const claimedProfile: Omit<UserProfile, 'email'> = {
          uid,
          authUid: uid,
          employeeCode: inv.employeeCode,
          fullName: inv.fullName,
          title: inv.title || 'Chuyên viên',
          roles: inv.roles,
          groupId: inv.groupId || 'grp_1',
          managerId: inv.managerId || '',
          isActive: inv.isActive,
          departmentId: DEPARTMENT_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const batch = writeBatch(db);
        batch.set(userRef, claimedProfile);
        batch.set(doc(db, 'users', uid, 'private', 'info'), {
          uid,
          authUid: uid,
          email,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        return {
          profile: { ...claimedProfile, email } as UserProfile,
          status: 'OK',
        };
      }
    }

    return { profile: null, status: 'NOT_INVITED' };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
}

export async function createOrUpdateTask(params: {
  existingTask?: TaskItem;
  input: {
    title: string;
    description: string;
    projectId: string;
    groupId: string;
    assigneeIds: string[];
    reviewerId: string;
    priority: TaskPriority;
    startDate: string;
    dueDate: string;
    estimatedHours: number;
    labels: string[];
    attachments: string[];
  };
  actor: UserProfile;
  projects: Project[];
  allUsers: UserProfile[];
  existingTaskCount: number;
}): Promise<void> {
  const { input, actor, projects, allUsers, existingTaskCount, existingTask } = params;
  const selectedProject = input.projectId
    ? projects.find((p) => p.id === input.projectId) || null
    : null;

  if (existingTask) {
    const assigneeId = input.assigneeIds[0] || existingTask.assigneeId;
    const participantIds = buildParticipantIds({
      creatorId: existingTask.creatorId,
      assigneeId,
      reviewerId: input.reviewerId || existingTask.reviewerId,
      groupId: input.groupId,
      project: selectedProject,
      allUsers,
    });
    try {
      await updateDoc(doc(db, 'tasks', existingTask.id), {
        title: input.title.trim().slice(0, 200),
        description: input.description.trim().slice(0, 5000),
        projectId: input.projectId,
        groupId: input.groupId,
        assigneeId,
        reviewerId: input.reviewerId || existingTask.reviewerId,
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        estimatedHours: Number(input.estimatedHours) || 0,
        labels: input.labels.slice(0, 10),
        attachments: input.attachments.slice(0, 10),
        participantIds,
        updatedAt: serverTimestamp(),
      });
      await logTaskAudit({
        taskId: existingTask.id,
        actor,
        action: 'Cập nhật công việc',
        detail: `Cập nhật thông tin công việc "${input.title.trim()}"`,
        participantIds,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${existingTask.id}`);
    }
    return;
  }

  // Creating new task(s)
  const prefix = selectedProject
    ? selectedProject.code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : 'TX';
  let seq = existingTaskCount + 1;

  // If assigning to multiple users at once, create parent task + independent child tasks per assignee
  if (input.assigneeIds.length > 1) {
    const parentId = makeId('tsk');
    const parentCode = `${prefix}-${String(seq).padStart(2, '0')}`;
    seq += 1;

    const parentReviewer = input.reviewerId || actor.uid;
    const parentParticipants = buildParticipantIds({
      creatorId: actor.uid,
      assigneeId: input.assigneeIds[0],
      reviewerId: parentReviewer,
      groupId: input.groupId,
      project: selectedProject,
      allUsers,
    });
    const mergedParticipants = Array.from(
      new Set([...parentParticipants, ...input.assigneeIds])
    ).slice(0, 50);

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'tasks', parentId), {
        id: parentId,
        code: parentCode,
        title: input.title.trim().slice(0, 200),
        description: input.description.trim().slice(0, 5000),
        projectId: input.projectId,
        groupId: input.groupId,
        creatorId: actor.uid,
        assigneeId: actor.uid,
        reviewerId: parentReviewer,
        parentTaskId: '',
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        estimatedHours: Number(input.estimatedHours) || 0,
        labels: input.labels.slice(0, 10),
        attachments: input.attachments.slice(0, 10),
        status: 'DANG_THUC_HIEN' as TaskStatus,
        submissionStatus: 'CHUA_NOP' as SubmissionStatus,
        submissionNote: '',
        reviewResult: 'CHO_XAC_NHAN' as ReviewResult,
        reviewNote: '',
        isLocked: false,
        participantIds: mergedParticipants,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const assigneeId of input.assigneeIds) {
        const assigneeUser = allUsers.find((u) => u.uid === assigneeId);
        const childId = makeId('tsk');
        const childCode = `${prefix}-${String(seq).padStart(2, '0')}`;
        seq += 1;
        const childParticipants = buildParticipantIds({
          creatorId: actor.uid,
          assigneeId,
          reviewerId: parentReviewer,
          groupId: assigneeUser?.groupId || input.groupId,
          project: selectedProject,
          allUsers,
        });

        batch.set(doc(db, 'tasks', childId), {
          id: childId,
          code: childCode,
          title: `${input.title.trim()} (${assigneeUser?.fullName || 'Nhân sự'})`.slice(0, 200),
          description: input.description.trim().slice(0, 5000),
          projectId: input.projectId,
          groupId: assigneeUser?.groupId || input.groupId,
          creatorId: actor.uid,
          assigneeId,
          reviewerId: parentReviewer,
          parentTaskId: parentId,
          priority: input.priority,
          startDate: input.startDate,
          dueDate: input.dueDate,
          estimatedHours: Number(input.estimatedHours) || 0,
          labels: input.labels.slice(0, 10),
          attachments: input.attachments.slice(0, 10),
          status: 'MOI' as TaskStatus,
          submissionStatus: 'CHUA_NOP' as SubmissionStatus,
          submissionNote: '',
          reviewResult: 'CHO_XAC_NHAN' as ReviewResult,
          reviewNote: '',
          isLocked: false,
          participantIds: childParticipants,
          departmentId: DEPARTMENT_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      await logSystemAudit({
        actor,
        action: 'Giao việc nhiều người',
        targetType: 'task',
        targetId: parentId,
        detail: `Tạo công việc ${parentCode} và tách thành ${input.assigneeIds.length} việc con độc lập`,
        allUsers,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tasks/batch');
    }
    return;
  }

  // Single assignee (either assigned or self-created)
  const assigneeId = input.assigneeIds[0] || actor.uid;
  const isSelfCreate = assigneeId === actor.uid;
  const reviewerId =
    input.reviewerId ||
    (isSelfCreate ? actor.managerId || actor.uid : actor.uid);

  const taskId = makeId('tsk');
  const code = `${prefix}-${String(seq).padStart(2, '0')}`;
  const participantIds = buildParticipantIds({
    creatorId: actor.uid,
    assigneeId,
    reviewerId,
    groupId: input.groupId,
    project: selectedProject,
    allUsers,
  });

  try {
    await setDoc(doc(db, 'tasks', taskId), {
      id: taskId,
      code,
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 5000),
      projectId: input.projectId,
      groupId: input.groupId,
      creatorId: actor.uid,
      assigneeId,
      reviewerId,
      parentTaskId: '',
      priority: input.priority,
      startDate: input.startDate,
      dueDate: input.dueDate,
      estimatedHours: Number(input.estimatedHours) || 0,
      labels: input.labels.slice(0, 10),
      attachments: input.attachments.slice(0, 10),
      status: 'MOI' as TaskStatus,
      submissionStatus: 'CHUA_NOP' as SubmissionStatus,
      submissionNote: '',
      reviewResult: 'CHO_XAC_NHAN' as ReviewResult,
      reviewNote: '',
      isLocked: false,
      participantIds,
      departmentId: DEPARTMENT_ID,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await logTaskAudit({
      taskId,
      actor,
      action: isSelfCreate ? 'Tự tạo công việc' : 'Giao công việc',
      detail: `Khởi tạo công việc ${code}: "${input.title.trim()}"`,
      participantIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tasks/${taskId}`);
  }
}

export async function updateTaskProgressOrSubmit(params: {
  task: TaskItem;
  actor: UserProfile;
  nextStatus: 'MOI' | 'DANG_THUC_HIEN' | 'CHO_XAC_NHAN' | 'TAM_HOAN';
  submissionNote?: string;
  attachments?: string[];
}): Promise<void> {
  const { task, actor, nextStatus, submissionNote, attachments } = params;
  const isSubmitting = nextStatus === 'CHO_XAC_NHAN';
  try {
    await updateDoc(doc(db, 'tasks', task.id), {
      status: nextStatus,
      submissionStatus: isSubmitting ? 'DA_NOP' : task.submissionStatus,
      submissionNote: isSubmitting
        ? (submissionNote || 'Đã hoàn thành và nộp kết quả').slice(0, 1000)
        : task.submissionNote || '',
      attachments: attachments ? attachments.slice(0, 10) : task.attachments || [],
      updatedAt: serverTimestamp(),
    });
    await logTaskAudit({
      taskId: task.id,
      actor,
      action: isSubmitting ? 'Nộp kết quả' : 'Cập nhật trạng thái',
      detail: isSubmitting
        ? `Nộp kết quả công việc: ${submissionNote || 'Chờ xác nhận'}`
        : `Chuyển trạng thái sang ${nextStatus}`,
      participantIds: task.participantIds,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
  }
}

export async function reviewTaskDecision(params: {
  task: TaskItem;
  actor: UserProfile;
  decision: 'APPROVE' | 'REJECT' | 'CANCEL' | 'REOPEN';
  note?: string;
}): Promise<void> {
  const { task, actor, decision, note } = params;
  try {
    if (decision === 'APPROVE') {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'HOAN_THANH',
        submissionStatus: 'DA_NOP',
        reviewResult: 'DA_HOAN_THANH',
        reviewNote: (note || 'Đã nghiệm thu hoàn thành').slice(0, 1000),
        isLocked: true,
        updatedAt: serverTimestamp(),
      });
      await logTaskAudit({
        taskId: task.id,
        actor,
        action: 'Xác nhận hoàn thành',
        detail: note?.trim() ? `Xác nhận hoàn thành: ${note.trim()}` : 'Xác nhận hoàn thành và khóa công việc',
        participantIds: task.participantIds,
      });
    } else if (decision === 'REJECT') {
      const reason = (note || '').trim();
      if (reason.length < 3) {
        throw new Error('Vui lòng nhập lý do chưa hoàn thành (tối thiểu 3 ký tự).');
      }
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'CHUA_HOAN_THANH',
        submissionStatus: 'CHUA_NOP',
        reviewResult: 'CHUA_HOAN_THANH',
        reviewNote: reason.slice(0, 1000),
        isLocked: false,
        updatedAt: serverTimestamp(),
      });
      await logTaskAudit({
        taskId: task.id,
        actor,
        action: 'Yêu cầu làm lại',
        detail: `Chưa hoàn thành — Lý do: ${reason}`,
        participantIds: task.participantIds,
      });
    } else if (decision === 'REOPEN') {
      const reason = (note || '').trim();
      if (reason.length < 3) {
        throw new Error('Vui lòng nhập lý do mở lại công việc (tối thiểu 3 ký tự).');
      }
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'DANG_THUC_HIEN',
        submissionStatus: 'CHUA_NOP',
        reviewResult: 'CHUA_HOAN_THANH',
        reviewNote: reason.slice(0, 1000),
        isLocked: false,
        updatedAt: serverTimestamp(),
      });
      await logTaskAudit({
        taskId: task.id,
        actor,
        action: 'Mở lại công việc',
        detail: `Mở lại công việc đã khóa — Lý do: ${reason}`,
        participantIds: task.participantIds,
      });
    } else if (decision === 'CANCEL') {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'HUY',
        reviewNote: (note || 'Đã hủy công việc').slice(0, 1000),
        isLocked: false,
        updatedAt: serverTimestamp(),
      });
      await logTaskAudit({
        taskId: task.id,
        actor,
        action: 'Hủy công việc',
        detail: note?.trim() || 'Đã hủy công việc',
        participantIds: task.participantIds,
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Vui lòng nhập lý do')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
  }
}

export async function batchApproveTasks(tasks: TaskItem[], actor: UserProfile): Promise<void> {
  if (tasks.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const t of tasks) {
      batch.update(doc(db, 'tasks', t.id), {
        status: 'HOAN_THANH',
        submissionStatus: 'DA_NOP',
        reviewResult: 'DA_HOAN_THANH',
        reviewNote: 'Duyệt hoàn thành hàng loạt',
        isLocked: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'tasks/batchApprove');
  }
}

export async function addSubtask(task: TaskItem, title: string, actor: UserProfile): Promise<void> {
  const id = makeId('sub');
  try {
    await setDoc(doc(db, 'tasks', task.id, 'subtasks', id), {
      id,
      title: title.trim().slice(0, 200),
      isDone: false,
      createdBy: actor.uid,
      taskParticipantIds: task.participantIds.slice(0, 50),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tasks/${task.id}/subtasks/${id}`);
  }
}

export async function toggleSubtask(task: TaskItem, subtaskId: string, isDone: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'tasks', task.id, 'subtasks', subtaskId), {
      isDone,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}/subtasks/${subtaskId}`);
  }
}

export async function addTaskComment(
  task: TaskItem,
  content: string,
  mentions: string[],
  actor: UserProfile
): Promise<void> {
  const id = makeId('cmt');
  try {
    await setDoc(doc(db, 'tasks', task.id, 'comments', id), {
      id,
      authorId: actor.uid,
      authorName: actor.fullName,
      content: content.trim().slice(0, 2000),
      mentions: mentions.slice(0, 20),
      taskParticipantIds: task.participantIds.slice(0, 50),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tasks/${task.id}/comments/${id}`);
  }
}

export async function saveProject(params: {
  existing?: Project;
  input: {
    code: string;
    name: string;
    description: string;
    startDate: string;
    expectedEndDate: string;
    status: ProjectStatus;
    pmId: string;
    memberIds: string[];
    labels: string[];
  };
  actor: UserProfile;
  allUsers: UserProfile[];
}): Promise<void> {
  const { existing, input, actor, allUsers } = params;
  const id = existing ? existing.id : makeId('prj');
  const leadershipIds = allUsers
    .filter((u) => u.roles.includes('ADMIN') || u.roles.includes('TRUONG_PHONG') || u.roles.includes('PHO_PHONG'))
    .map((u) => u.uid);

  const memberIds = Array.from(
    new Set([input.pmId, actor.uid, ...input.memberIds, ...leadershipIds])
  ).slice(0, 50);

  try {
    const batch = writeBatch(db);
    if (existing) {
      batch.update(doc(db, 'projects', id), {
        code: input.code.trim().toUpperCase().slice(0, 32),
        name: input.name.trim().slice(0, 160),
        description: input.description.trim().slice(0, 2000),
        startDate: input.startDate,
        expectedEndDate: input.expectedEndDate,
        status: input.status,
        pmId: input.pmId,
        memberIds,
        labels: input.labels.slice(0, 15),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, 'projects', id), {
        id,
        code: input.code.trim().toUpperCase().slice(0, 32),
        name: input.name.trim().slice(0, 160),
        description: input.description.trim().slice(0, 2000),
        startDate: input.startDate,
        expectedEndDate: input.expectedEndDate,
        status: input.status,
        pmId: input.pmId,
        memberIds,
        labels: input.labels.slice(0, 15),
        createdBy: actor.uid,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const uid of memberIds) {
      batch.set(doc(db, 'projects', id, 'members', uid), {
        userId: uid,
        projectRole: uid === input.pmId ? 'QUAN_LY_DU_AN' : 'THANH_VIEN',
        joinedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    await logSystemAudit({
      actor,
      action: existing ? 'Cập nhật dự án' : 'Tạo dự án',
      targetType: 'project',
      targetId: id,
      detail: `${existing ? 'Cập nhật' : 'Tạo mới'} dự án ${input.code.toUpperCase()} - ${input.name}`,
      allUsers,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `projects/${id}`);
  }
}

export async function saveWorkLog(params: {
  userId: string;
  task: TaskItem;
  workDate: string;
  hours: number;
  progressPercent: number;
  note: string;
  allUsers: UserProfile[];
  existingId?: string;
}): Promise<void> {
  const { userId, task, workDate, hours, progressPercent, note, allUsers, existingId } = params;
  const id = existingId || makeId('wl');
  const viewerIds = Array.from(
    new Set([
      userId,
      task.reviewerId,
      ...allUsers
        .filter((u) => u.roles.includes('ADMIN') || u.roles.includes('TRUONG_PHONG') || u.roles.includes('PHO_PHONG') || (u.roles.includes('TRUONG_NHOM') && u.groupId === task.groupId))
        .map((u) => u.uid),
    ])
  ).slice(0, 30);

  try {
    if (existingId) {
      await updateDoc(doc(db, 'workLogs', existingId), {
        taskId: task.id,
        projectId: task.projectId || '',
        hours: Number(hours),
        progressPercent: Number(progressPercent),
        note: note.trim().slice(0, 1000),
        viewerIds,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'workLogs', id), {
        id,
        userId,
        taskId: task.id,
        projectId: task.projectId || '',
        workDate,
        workDateNum: dateStrToNum(workDate),
        hours: Number(hours),
        progressPercent: Number(progressPercent),
        note: note.trim().slice(0, 1000),
        viewerIds,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workLogs/${id}`);
  }
}

export async function unlockWorkLogDate(params: {
  targetUser: UserProfile;
  workDate: string;
  reason: string;
  actor: UserProfile;
  allUsers: UserProfile[];
}): Promise<void> {
  const { targetUser, workDate, reason, actor, allUsers } = params;
  const id = `${targetUser.uid}_${workDate}`;
  try {
    await setDoc(doc(db, 'workLogUnlocks', id), {
      id,
      userId: targetUser.uid,
      workDate,
      unlockedBy: actor.uid,
      reason: reason.trim().slice(0, 500),
      departmentId: DEPARTMENT_ID,
      unlockedAt: serverTimestamp(),
    });
    await logSystemAudit({
      actor,
      action: 'Mở khóa log work',
      targetType: 'workLogUnlock',
      targetId: id,
      detail: `Mở khóa ngày ${workDate} cho ${targetUser.fullName}. Lý do: ${reason.trim()}`,
      allUsers,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workLogUnlocks/${id}`);
  }
}

export async function saveUserByAdmin(params: {
  existing?: UserProfile;
  input: {
    email: string;
    fullName: string;
    employeeCode: string;
    title: string;
    roles: RoleCode[];
    groupId: string;
    managerId: string;
    isActive: boolean;
  };
  actor: UserProfile;
  allUsers: UserProfile[];
}): Promise<void> {
  const { existing, input, actor, allUsers } = params;
  const uid = existing ? existing.uid : makeId('usr');
  const emailLower = input.email.trim().toLowerCase();

  try {
    const batch = writeBatch(db);
    if (existing) {
      batch.update(doc(db, 'users', uid), {
        employeeCode: input.employeeCode.trim().slice(0, 32),
        fullName: input.fullName.trim().slice(0, 120),
        title: input.title.trim().slice(0, 120),
        roles: input.roles,
        groupId: input.groupId,
        managerId: input.managerId,
        isActive: input.isActive,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, 'users', uid), {
        uid,
        employeeCode: input.employeeCode.trim().slice(0, 32),
        fullName: input.fullName.trim().slice(0, 120),
        title: input.title.trim().slice(0, 120),
        roles: input.roles,
        groupId: input.groupId,
        managerId: input.managerId,
        isActive: input.isActive,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (emailLower) {
      batch.set(doc(db, 'users', uid, 'private', 'info'), {
        uid,
        email: emailLower,
        updatedAt: serverTimestamp(),
      });
      const inviteId = sanitizeEmailId(emailLower);
      batch.set(doc(db, 'invites', inviteId), {
        id: inviteId,
        email: emailLower,
        targetUserId: uid,
        roles: input.roles,
        groupId: input.groupId,
        managerId: input.managerId,
        fullName: input.fullName.trim().slice(0, 120),
        employeeCode: input.employeeCode.trim().slice(0, 32),
        title: input.title.trim().slice(0, 120),
        isActive: input.isActive,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    await logSystemAudit({
      actor,
      action: existing ? 'Cập nhật nhân sự' : 'Tạo nhân sự mới',
      targetType: 'user',
      targetId: uid,
      detail: `${existing ? 'Cập nhật' : 'Tạo mới'} ${input.fullName} (${input.employeeCode}) - Vai trò: ${input.roles.join(', ')}`,
      allUsers,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function saveGroupByAdmin(params: {
  group: WorkGroup;
  name: string;
  description: string;
  leaderId: string;
  allUsers: UserProfile[];
  actor: UserProfile;
}): Promise<void> {
  const { group, name, description, leaderId, allUsers, actor } = params;
  const memberUids = Array.from(
    new Set([
      ...allUsers.map((u) => u.uid),
      leaderId,
    ])
  ).slice(0, 50);

  try {
    await updateDoc(doc(db, 'groups', group.id), {
      name: name.trim().slice(0, 120),
      description: description.trim().slice(0, 500),
      leaderId,
      memberUids,
      updatedAt: serverTimestamp(),
    });
    await logSystemAudit({
      actor,
      action: 'Cập nhật nhóm việc',
      targetType: 'group',
      targetId: group.id,
      detail: `Cập nhật nhóm ${group.code}: ${name.trim()}`,
      allUsers,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `groups/${group.id}`);
  }
}

export async function saveSystemConfigByAdmin(params: {
  config: SystemConfig;
  actor: UserProfile;
  allUsers: UserProfile[];
}): Promise<void> {
  const { config, actor, allUsers } = params;
  try {
    await setDoc(doc(db, 'systemConfigs', 'department'), {
      lockHour: Number(config.lockHour),
      lockMinute: Number(config.lockMinute),
      reminderHour: Number(config.reminderHour),
      reminderMinute: Number(config.reminderMinute),
      timezone: 'Asia/Ho_Chi_Minh',
      defaultLabels: config.defaultLabels.slice(0, 30),
      holidays: (config.holidays || []).slice(0, 50),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    await logSystemAudit({
      actor,
      action: 'Cập nhật cấu hình hệ thống',
      targetType: 'systemConfig',
      targetId: 'department',
      detail: `Giờ khóa ngày: ${config.lockHour}:${String(config.lockMinute).padStart(2, '0')} UTC+7`,
      allUsers,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'systemConfigs/department');
  }
}

export async function fetchUserEmailForAdmin(userId: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'private', 'info'));
    if (snap.exists()) {
      return (snap.data() as { email?: string }).email || '';
    }
    return '';
  } catch {
    return '';
  }
}

export async function checkIfDepartmentSeeded(): Promise<boolean> {
  try {
    const q = query(collection(db, 'groups'), where('departmentId', '==', DEPARTMENT_ID));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch {
    return false;
  }
}

export function getTodayWorkDateVN(): { dateStr: string; dateNum: number } {
  const { dateStr, dateNum } = getVietnamNowParts();
  return { dateStr, dateNum };
}
