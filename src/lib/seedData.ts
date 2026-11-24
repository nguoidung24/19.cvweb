import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  DEPARTMENT_ID,
  ProjectStatus,
  ReviewResult,
  RoleCode,
  SubmissionStatus,
  TaskPriority,
  TaskStatus,
} from '../types/domain';
import { db, handleFirestoreError, OperationType } from './firebase';
import { dateStrToNum, getVietnamNowParts } from './time';

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function seedDepartmentData(currentAdminUid: string): Promise<void> {
  const { dateStr: today } = getVietnamNowParts();
  const yesterday = addDays(today, -1);
  const threeDaysAgo = addDays(today, -3);
  const nextWeek = addDays(today, 7);
  const twoWeeks = addDays(today, 14);
  const nextMonth = addDays(today, 30);

  // Batch 1: SystemConfig, Users, Private Info, Groups, Projects
  const batch1 = writeBatch(db);
  let hasBatch1Writes = false;

  const configSnap = await getDoc(doc(db, 'systemConfigs', 'department'));
  if (!configSnap.exists()) {
    batch1.set(doc(db, 'systemConfigs', 'department'), {
      lockHour: 23,
      lockMinute: 59,
      reminderHour: 17,
      reminderMinute: 30,
      timezone: 'Asia/Ho_Chi_Minh',
      defaultLabels: ['Hành chính', 'Báo cáo định kỳ', 'Văn bản trình ký', 'Kiểm tra nội bộ', 'Khẩn'],
      holidays: [],
      updatedBy: currentAdminUid,
      updatedAt: serverTimestamp(),
    });
    hasBatch1Writes = true;
  }

  // 2. Staff Roster: 1 Trưởng phòng, 1 Phó phòng, 4 Nhóm x (1 Trưởng nhóm + 3 Chuyên viên) + Admin (current user)
  const staff: Array<{
    uid: string;
    employeeCode: string;
    fullName: string;
    title: string;
    roles: RoleCode[];
    groupId: string;
    managerId: string;
    email: string;
  }> = [
    {
      uid: 'usr_tp_01',
      employeeCode: 'TP-01',
      fullName: 'Nguyễn Minh Hoàng',
      title: 'Trưởng phòng Hành chính – Nghiệp vụ',
      roles: ['TRUONG_PHONG'],
      groupId: 'grp_1',
      managerId: currentAdminUid,
      email: 'truongphong@phongban.local',
    },
    {
      uid: 'usr_pp_01',
      employeeCode: 'PP-01',
      fullName: 'Trần Thị Thu Hà',
      title: 'Phó Trưởng phòng',
      roles: ['PHO_PHONG'],
      groupId: 'grp_2',
      managerId: 'usr_tp_01',
      email: 'phophong@phongban.local',
    },
    // Nhóm 1: Hành chính tổng hợp
    {
      uid: 'usr_tn_1',
      employeeCode: 'TN-10',
      fullName: 'Lê Quốc Khánh',
      title: 'Trưởng nhóm Hành chính tổng hợp',
      roles: ['TRUONG_NHOM', 'QUAN_LY_DU_AN'],
      groupId: 'grp_1',
      managerId: 'usr_tp_01',
      email: 'truongnhom1@phongban.local',
    },
    {
      uid: 'usr_cv_1_1',
      employeeCode: 'CV-11',
      fullName: 'Phạm Lan Anh',
      title: 'Chuyên viên Văn thư – Lưu trữ',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_1',
      managerId: 'usr_tn_1',
      email: 'cv11@phongban.local',
    },
    {
      uid: 'usr_cv_1_2',
      employeeCode: 'CV-12',
      fullName: 'Đỗ Hoàng Nam',
      title: 'Chuyên viên Tổng hợp',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_1',
      managerId: 'usr_tn_1',
      email: 'cv12@phongban.local',
    },
    {
      uid: 'usr_cv_1_3',
      employeeCode: 'CV-13',
      fullName: 'Vũ Ngọc Mai',
      title: 'Chuyên viên Tiếp nhận hồ sơ',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_1',
      managerId: 'usr_tn_1',
      email: 'cv13@phongban.local',
    },
    // Nhóm 2: Kế hoạch & Điều phối
    {
      uid: 'usr_tn_2',
      employeeCode: 'TN-20',
      fullName: 'Ngô Thanh Tùng',
      title: 'Trưởng nhóm Kế hoạch & Điều phối',
      roles: ['TRUONG_NHOM', 'QUAN_LY_DU_AN'],
      groupId: 'grp_2',
      managerId: 'usr_pp_01',
      email: 'truongnhom2@phongban.local',
    },
    {
      uid: 'usr_cv_2_1',
      employeeCode: 'CV-21',
      fullName: 'Bùi Thị Hồng Nhung',
      title: 'Chuyên viên Kế hoạch',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_2',
      managerId: 'usr_tn_2',
      email: 'cv21@phongban.local',
    },
    {
      uid: 'usr_cv_2_2',
      employeeCode: 'CV-22',
      fullName: 'Hoàng Đức Anh',
      title: 'Chuyên viên Điều phối nghiệp vụ',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_2',
      managerId: 'usr_tn_2',
      email: 'cv22@phongban.local',
    },
    {
      uid: 'usr_cv_2_3',
      employeeCode: 'CV-23',
      fullName: 'Nguyễn Thảo Vy',
      title: 'Chuyên viên Thống kê báo cáo',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_2',
      managerId: 'usr_tn_2',
      email: 'cv23@phongban.local',
    },
    // Nhóm 3: Pháp chế & Hồ sơ
    {
      uid: 'usr_tn_3',
      employeeCode: 'TN-30',
      fullName: 'Trịnh Văn Quang',
      title: 'Trưởng nhóm Pháp chế & Hồ sơ',
      roles: ['TRUONG_NHOM'],
      groupId: 'grp_3',
      managerId: 'usr_pp_01',
      email: 'truongnhom3@phongban.local',
    },
    {
      uid: 'usr_cv_3_1',
      employeeCode: 'CV-31',
      fullName: 'Đặng Minh Thư',
      title: 'Chuyên viên Pháp chế',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_3',
      managerId: 'usr_tn_3',
      email: 'cv31@phongban.local',
    },
    {
      uid: 'usr_cv_3_2',
      employeeCode: 'CV-32',
      fullName: 'Lý Gia Bảo',
      title: 'Chuyên viên Thẩm định quy trình',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_3',
      managerId: 'usr_tn_3',
      email: 'cv32@phongban.local',
    },
    {
      uid: 'usr_cv_3_3',
      employeeCode: 'CV-33',
      fullName: 'Phan Thanh Hằng',
      title: 'Chuyên viên Kiểm soát tuân thủ',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_3',
      managerId: 'usr_tn_3',
      email: 'cv33@phongban.local',
    },
    // Nhóm 4: Tài chính & Hậu cần
    {
      uid: 'usr_tn_4',
      employeeCode: 'TN-40',
      fullName: 'Tạ Quang Huy',
      title: 'Trưởng nhóm Tài chính & Hậu cần',
      roles: ['TRUONG_NHOM'],
      groupId: 'grp_4',
      managerId: 'usr_tp_01',
      email: 'truongnhom4@phongban.local',
    },
    {
      uid: 'usr_cv_4_1',
      employeeCode: 'CV-41',
      fullName: 'Dương Kim Ngân',
      title: 'Chuyên viên Dự toán & Thanh quyết toán',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_4',
      managerId: 'usr_tn_4',
      email: 'cv41@phongban.local',
    },
    {
      uid: 'usr_cv_4_2',
      employeeCode: 'CV-42',
      fullName: 'Huỳnh Tuấn Kiệt',
      title: 'Chuyên viên Quản lý tài sản',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_4',
      managerId: 'usr_tn_4',
      email: 'cv42@phongban.local',
    },
    {
      uid: 'usr_cv_4_3',
      employeeCode: 'CV-43',
      fullName: 'Cao Mỹ Linh',
      title: 'Chuyên viên Mua sắm & Hậu cần',
      roles: ['CHUYEN_VIEN'],
      groupId: 'grp_4',
      managerId: 'usr_tn_4',
      email: 'cv43@phongban.local',
    },
  ];

  const allUids = [currentAdminUid, ...staff.map((s) => s.uid)];

  for (const member of staff) {
    const uSnap = await getDoc(doc(db, 'users', member.uid));
    if (!uSnap.exists()) {
      batch1.set(doc(db, 'users', member.uid), {
        uid: member.uid,
        employeeCode: member.employeeCode,
        fullName: member.fullName,
        title: member.title,
        roles: member.roles,
        groupId: member.groupId,
        managerId: member.managerId,
        isActive: true,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch1.set(doc(db, 'users', member.uid, 'private', 'info'), {
        uid: member.uid,
        email: member.email,
        updatedAt: serverTimestamp(),
      });
      hasBatch1Writes = true;
    }
  }

  // 3. 4 Work Groups
  const groups = [
    {
      id: 'grp_1',
      code: 'NHOM-1',
      name: 'Nhóm 1: Hành chính tổng hợp',
      description: 'Quản lý công văn đi đến, lưu trữ hồ sơ, lịch công tác phòng.',
      leaderId: 'usr_tn_1',
    },
    {
      id: 'grp_2',
      code: 'NHOM-2',
      name: 'Nhóm 2: Kế hoạch & Điều phối',
      description: 'Xây dựng kế hoạch tháng/quý, điều phối nguồn lực và tổng hợp báo cáo.',
      leaderId: 'usr_tn_2',
    },
    {
      id: 'grp_3',
      code: 'NHOM-3',
      name: 'Nhóm 3: Pháp chế & Hồ sơ',
      description: 'Rà soát quy định nội bộ, thẩm định quy trình và lưu trữ pháp lý.',
      leaderId: 'usr_tn_3',
    },
    {
      id: 'grp_4',
      code: 'NHOM-4',
      name: 'Nhóm 4: Tài chính & Hậu cần',
      description: 'Dự toán chi phí hành chính, kiểm kê tài sản và trang thiết bị.',
      leaderId: 'usr_tn_4',
    },
  ];

  for (const g of groups) {
    const gSnap = await getDoc(doc(db, 'groups', g.id));
    if (!gSnap.exists()) {
      batch1.set(doc(db, 'groups', g.id), {
        ...g,
        memberUids: allUids.slice(0, 50),
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasBatch1Writes = true;
    }
  }

  // 4. 2 Sample Projects
  const project1Members = [
    currentAdminUid,
    'usr_tp_01',
    'usr_pp_01',
    'usr_tn_1',
    'usr_cv_1_1',
    'usr_cv_1_2',
    'usr_tn_3',
    'usr_cv_3_1',
  ];
  const project2Members = [
    currentAdminUid,
    'usr_tp_01',
    'usr_pp_01',
    'usr_tn_2',
    'usr_cv_2_1',
    'usr_tn_4',
    'usr_cv_4_1',
    'usr_cv_4_2',
  ];

  const projects: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    startDate: string;
    expectedEndDate: string;
    status: ProjectStatus;
    pmId: string;
    memberIds: string[];
    labels: string[];
  }> = [
    {
      id: 'prj_da001',
      code: 'DA-001',
      name: 'Chuẩn hóa quy trình lưu trữ hồ sơ 2026',
      description:
        'Rà soát toàn bộ danh mục hồ sơ hành chính, xây dựng bộ biểu mẫu chuẩn và quy trình ký duyệt liên phòng.',
      startDate: threeDaysAgo,
      expectedEndDate: nextMonth,
      status: 'DANG_THUC_HIEN',
      pmId: 'usr_tn_1',
      memberIds: project1Members,
      labels: ['Hành chính', 'Văn bản trình ký'],
    },
    {
      id: 'prj_da002',
      code: 'DA-002',
      name: 'Triển khai kiểm kê tài sản & trang thiết bị cuối năm',
      description:
        'Lập kế hoạch kiểm kê, đối chiếu sổ sách tài sản cố định và đề xuất thanh lý tài sản hư hỏng.',
      startDate: yesterday,
      expectedEndDate: twoWeeks,
      status: 'DANG_THUC_HIEN',
      pmId: 'usr_tn_2',
      memberIds: project2Members,
      labels: ['Kiểm tra nội bộ', 'Báo cáo định kỳ'],
    },
  ];

  for (const p of projects) {
    const pSnap = await getDoc(doc(db, 'projects', p.id));
    if (!pSnap.exists()) {
      batch1.set(doc(db, 'projects', p.id), {
        ...p,
        createdBy: currentAdminUid,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasBatch1Writes = true;
    }
  }

  try {
    if (hasBatch1Writes) {
      await batch1.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedDepartmentData/batch1');
  }

  // Batch 2: Project members & Sample Tasks (after projects exist!)
  const batch2 = writeBatch(db);
  let hasBatch2Writes = false;

  for (const p of projects) {
    for (const uid of p.memberIds) {
      const mSnap = await getDoc(doc(db, 'projects', p.id, 'members', uid));
      if (!mSnap.exists()) {
        batch2.set(doc(db, 'projects', p.id, 'members', uid), {
          userId: uid,
          projectRole: uid === p.pmId ? 'QUAN_LY_DU_AN' : 'THANH_VIEN',
          joinedAt: serverTimestamp(),
        });
        hasBatch2Writes = true;
      }
    }
  }

  // 5. Sample Tasks across all statuses
  const tasks: Array<{
    id: string;
    code: string;
    title: string;
    description: string;
    projectId: string;
    groupId: string;
    creatorId: string;
    assigneeId: string;
    reviewerId: string;
    priority: TaskPriority;
    startDate: string;
    dueDate: string;
    estimatedHours: number;
    labels: string[];
    status: TaskStatus;
    submissionStatus: SubmissionStatus;
    submissionNote: string;
    reviewResult: ReviewResult;
    reviewNote: string;
    isLocked: boolean;
  }> = [
    {
      id: 'tsk_seed_1',
      code: 'DA001-01',
      title: 'Khảo sát danh mục hồ sơ lưu trữ tại 4 nhóm',
      description: 'Thu thập danh mục hồ sơ tồn đọng 2025-2026 và phân loại theo thời hạn bảo quản.',
      projectId: 'prj_da001',
      groupId: 'grp_1',
      creatorId: currentAdminUid,
      assigneeId: 'usr_cv_1_1',
      reviewerId: currentAdminUid,
      priority: 'CAO',
      startDate: threeDaysAgo,
      dueDate: nextWeek,
      estimatedHours: 12,
      labels: ['Hành chính'],
      status: 'HOAN_THANH',
      submissionStatus: 'DA_NOP',
      submissionNote: 'Đã tổng hợp đầy đủ danh mục 142 đầu hồ sơ.',
      reviewResult: 'DA_HOAN_THANH',
      reviewNote: 'Hồ sơ phân loại đúng quy chuẩn lưu trữ.',
      isLocked: true,
    },
    {
      id: 'tsk_seed_2',
      code: 'DA001-02',
      title: 'Soạn thảo dự thảo quy trình luân chuyển công văn trình ký',
      description: 'Hoàn thiện sơ đồ luân chuyển công văn giấy và điện tử trình Ban Giám đốc duyệt.',
      projectId: 'prj_da001',
      groupId: 'grp_3',
      creatorId: currentAdminUid,
      assigneeId: 'usr_cv_3_1',
      reviewerId: currentAdminUid,
      priority: 'KHAN_CAP',
      startDate: yesterday,
      dueDate: today,
      estimatedHours: 8,
      labels: ['Văn bản trình ký'],
      status: 'CHO_XAC_NHAN',
      submissionStatus: 'DA_NOP',
      submissionNote: 'Đã hoàn thành bản dự thảo v2 và gửi đính kèm bảng phân công trách nhiệm.',
      reviewResult: 'CHO_XAC_NHAN',
      reviewNote: '',
      isLocked: false,
    },
    {
      id: 'tsk_seed_3',
      code: 'DA001-03',
      title: 'Thiết lập bộ biểu mẫu bàn giao hồ sơ định kỳ',
      description: 'Chuẩn hóa 05 biểu mẫu biên bản giao nhận hồ sơ nội bộ phòng ban.',
      projectId: 'prj_da001',
      groupId: 'grp_1',
      creatorId: 'usr_tn_1',
      assigneeId: 'usr_cv_1_2',
      reviewerId: currentAdminUid,
      priority: 'TRUNG_BINH',
      startDate: threeDaysAgo,
      dueDate: yesterday,
      estimatedHours: 6,
      labels: ['Hành chính'],
      status: 'CHUA_HOAN_THANH',
      submissionStatus: 'CHUA_NOP',
      submissionNote: '',
      reviewResult: 'CHUA_HOAN_THANH',
      reviewNote: 'Thiếu mẫu phụ lục đối chiếu số lượng trang và chữ ký xác nhận của trưởng nhóm.',
      isLocked: false,
    },
    {
      id: 'tsk_seed_4',
      code: 'DA002-01',
      title: 'Lập danh sách tài sản văn phòng và thiết bị cần kiểm kê',
      description: 'Đối chiếu danh sách tài sản trên sổ kế toán với thực tế tại các phòng làm việc.',
      projectId: 'prj_da002',
      groupId: 'grp_4',
      creatorId: currentAdminUid,
      assigneeId: 'usr_cv_4_2',
      reviewerId: currentAdminUid,
      priority: 'CAO',
      startDate: today,
      dueDate: nextWeek,
      estimatedHours: 16,
      labels: ['Kiểm tra nội bộ'],
      status: 'DANG_THUC_HIEN',
      submissionStatus: 'CHUA_NOP',
      submissionNote: '',
      reviewResult: 'CHO_XAC_NHAN',
      reviewNote: '',
      isLocked: false,
    },
    {
      id: 'tsk_seed_5',
      code: 'DA002-02',
      title: 'Tổng hợp dự toán chi phí bảo trì trang thiết bị quý IV',
      description: 'Thu thập báo giá tối thiểu 3 nhà cung cấp và lập bảng so sánh chi phí.',
      projectId: 'prj_da002',
      groupId: 'grp_4',
      creatorId: 'usr_tn_2',
      assigneeId: 'usr_cv_4_1',
      reviewerId: 'usr_tn_2',
      priority: 'TRUNG_BINH',
      startDate: today,
      dueDate: twoWeeks,
      estimatedHours: 10,
      labels: ['Báo cáo định kỳ'],
      status: 'MOI',
      submissionStatus: 'CHUA_NOP',
      submissionNote: '',
      reviewResult: 'CHO_XAC_NHAN',
      reviewNote: '',
      isLocked: false,
    },
    {
      id: 'tsk_seed_6',
      code: 'TX-001',
      title: 'Báo cáo tổng hợp công tác tuần của phòng ban',
      description: 'Việc thường xuyên: tổng hợp tiến độ các nhóm và chuẩn bị tài liệu giao ban đầu tuần.',
      projectId: '',
      groupId: 'grp_2',
      creatorId: currentAdminUid,
      assigneeId: currentAdminUid,
      reviewerId: currentAdminUid,
      priority: 'CAO',
      startDate: yesterday,
      dueDate: nextWeek,
      estimatedHours: 4,
      labels: ['Báo cáo định kỳ'],
      status: 'DANG_THUC_HIEN',
      submissionStatus: 'CHUA_NOP',
      submissionNote: '',
      reviewResult: 'CHO_XAC_NHAN',
      reviewNote: '',
      isLocked: false,
    },
    {
      id: 'tsk_seed_7',
      code: 'TX-002',
      title: 'Rà soát hợp đồng dịch vụ vệ sinh & bảo vệ tòa nhà',
      description: 'Việc thường xuyên ngoài dự án: kiểm tra điều khoản gia hạn hợp đồng năm 2027.',
      projectId: '',
      groupId: 'grp_3',
      creatorId: currentAdminUid,
      assigneeId: 'usr_cv_3_2',
      reviewerId: currentAdminUid,
      priority: 'THAP',
      startDate: threeDaysAgo,
      dueDate: twoWeeks,
      estimatedHours: 5,
      labels: ['Hành chính'],
      status: 'TAM_HOAN',
      submissionStatus: 'CHUA_NOP',
      submissionNote: '',
      reviewResult: 'CHO_XAC_NHAN',
      reviewNote: '',
      isLocked: false,
    },
  ];

  const baseLeadership = [currentAdminUid, 'usr_tp_01', 'usr_pp_01'];
  const taskParticipantMap: Record<string, string[]> = {};

  for (const t of tasks) {
    const pIds = Array.from(
      new Set([
        ...baseLeadership,
        t.creatorId,
        t.assigneeId,
        t.reviewerId,
        ...(t.projectId === 'prj_da001' ? project1Members : t.projectId === 'prj_da002' ? project2Members : []),
      ])
    ).slice(0, 50);
    taskParticipantMap[t.id] = pIds;

    const tSnap = await getDoc(doc(db, 'tasks', t.id));
    if (!tSnap.exists()) {
      batch2.set(doc(db, 'tasks', t.id), {
        ...t,
        parentTaskId: '',
        attachments: [],
        participantIds: pIds,
        departmentId: DEPARTMENT_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasBatch2Writes = true;
    }
  }

  try {
    if (hasBatch2Writes) {
      await batch2.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedDepartmentData/batch2');
  }

  // Batch 3: Subtasks & WorkLog (after tasks exist!)
  const batch3 = writeBatch(db);
  let hasBatch3Writes = false;

  for (const t of tasks) {
    const subId = `${t.id}_sub_1`;
    const subSnap = await getDoc(doc(db, 'tasks', t.id, 'subtasks', subId));
    if (!subSnap.exists()) {
      batch3.set(doc(db, 'tasks', t.id, 'subtasks', subId), {
        id: subId,
        title: 'Thu thập số liệu và tài liệu tham chiếu ban đầu',
        isDone: t.status === 'HOAN_THANH' || t.status === 'CHO_XAC_NHAN',
        createdBy: t.creatorId,
        taskParticipantIds: taskParticipantMap[t.id],
        createdAt: serverTimestamp(),
      });
      hasBatch3Writes = true;
    }
  }

  const wlSnap = await getDoc(doc(db, 'workLogs', 'wl_seed_today_1'));
  if (!wlSnap.exists()) {
    batch3.set(doc(db, 'workLogs', 'wl_seed_today_1'), {
      id: 'wl_seed_today_1',
      userId: currentAdminUid,
      taskId: 'tsk_seed_6',
      projectId: '',
      workDate: today,
      workDateNum: dateStrToNum(today),
      hours: 3.5,
      progressPercent: 60,
      note: 'Tổng hợp số liệu báo cáo tuần từ Trưởng nhóm 1 và Nhóm 2.',
      viewerIds: baseLeadership,
      departmentId: DEPARTMENT_ID,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    hasBatch3Writes = true;
  }

  try {
    if (hasBatch3Writes) {
      await batch3.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedDepartmentData/batch3');
  }
}
