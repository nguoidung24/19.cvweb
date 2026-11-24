import React, { useState } from 'react';
import { Database, Edit3, Lock, Plus, Settings, Shield, Unlock, Users, X } from 'lucide-react';
import {
  ROLE_LABELS,
  RoleCode,
  SystemAuditLog,
  SystemConfig,
  UserProfile,
  WorkGroup,
} from '../types/domain';
import {
  fetchUserEmailForAdmin,
  saveGroupByAdmin,
  saveSystemConfigByAdmin,
  saveUserByAdmin,
} from '../lib/firestoreService';
import { canManageUsers } from '../lib/rbac';
import { seedDepartmentData } from '../lib/seedData';
import { formatTimestamp } from '../lib/time';

interface AdminViewProps {
  currentUser: UserProfile;
  users: UserProfile[];
  groups: WorkGroup[];
  config: SystemConfig | null;
  auditLogs: SystemAuditLog[];
  onNotify: (msg: string) => void;
}

export function AdminView({
  currentUser,
  users,
  groups,
  config,
  auditLogs,
  onNotify,
}: AdminViewProps) {
  const [tab, setTab] = useState<'USERS' | 'GROUPS' | 'CONFIG' | 'AUDIT'>('USERS');
  const isAdmin = canManageUsers(currentUser);

  // User modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [uEmail, setUEmail] = useState('');
  const [uName, setUName] = useState('');
  const [uCode, setUCode] = useState('');
  const [uTitle, setUTitle] = useState('');
  const [uRoles, setURoles] = useState<RoleCode[]>(['CHUYEN_VIEN']);
  const [uGroupId, setUGroupId] = useState(groups[0]?.id || 'grp_1');
  const [uManagerId, setUManagerId] = useState(currentUser.uid);
  const [uActive, setUActive] = useState(true);
  const [savingUser, setSavingUser] = useState(false);

  // Group edit
  const [editingGroup, setEditingGroup] = useState<WorkGroup | null>(null);
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gLeader, setGLeader] = useState('');

  // Config state
  const [lockHour, setLockHour] = useState(String(config?.lockHour ?? 23));
  const [lockMinute, setLockMinute] = useState(String(config?.lockMinute ?? 59));
  const [reminderHour, setReminderHour] = useState(String(config?.reminderHour ?? 17));
  const [reminderMinute, setReminderMinute] = useState(String(config?.reminderMinute ?? 30));
  const [labelsInput, setLabelsInput] = useState((config?.defaultLabels || []).join(', '));
  const [seeding, setSeeding] = useState(false);

  async function openCreateUser() {
    setEditingUser(null);
    setUEmail('');
    setUName('');
    setUCode(`CV-${users.length + 1}`);
    setUTitle('Chuyên viên');
    setURoles(['CHUYEN_VIEN']);
    setUGroupId(groups[0]?.id || 'grp_1');
    setUManagerId(currentUser.uid);
    setUActive(true);
    setUserModalOpen(true);
  }

  async function openEditUser(u: UserProfile) {
    setEditingUser(u);
    const email = await fetchUserEmailForAdmin(u.uid);
    setUEmail(email);
    setUName(u.fullName);
    setUCode(u.employeeCode);
    setUTitle(u.title || '');
    setURoles(u.roles);
    setUGroupId(u.groupId || 'grp_1');
    setUManagerId(u.managerId || currentUser.uid);
    setUActive(u.isActive);
    setUserModalOpen(true);
  }

  function toggleRole(r: RoleCode) {
    setURoles((prev) =>
      prev.includes(r)
        ? prev.length > 1
          ? prev.filter((x) => x !== r)
          : prev
        : [...prev, r]
    );
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!uName.trim() || !uCode.trim()) return;
    setSavingUser(true);
    try {
      await saveUserByAdmin({
        existing: editingUser || undefined,
        input: {
          email: uEmail,
          fullName: uName,
          employeeCode: uCode,
          title: uTitle,
          roles: uRoles,
          groupId: uGroupId,
          managerId: uManagerId,
          isActive: uActive,
        },
        actor: currentUser,
        allUsers: users,
      });
      setUserModalOpen(false);
      onNotify(editingUser ? 'Đã cập nhật hồ sơ nhân sự.' : 'Đã tạo tài khoản nhân sự mới.');
    } finally {
      setSavingUser(false);
    }
  }

  async function handleToggleLockUser(u: UserProfile) {
    if (!isAdmin || u.uid === currentUser.uid) return;
    const email = await fetchUserEmailForAdmin(u.uid);
    await saveUserByAdmin({
      existing: u,
      input: {
        email,
        fullName: u.fullName,
        employeeCode: u.employeeCode,
        title: u.title || '',
        roles: u.roles,
        groupId: u.groupId || 'grp_1',
        managerId: u.managerId || '',
        isActive: !u.isActive,
      },
      actor: currentUser,
      allUsers: users,
    });
    onNotify(u.isActive ? `Đã khóa tài khoản ${u.fullName}.` : `Đã mở khóa ${u.fullName}.`);
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGroup) return;
    await saveGroupByAdmin({
      group: editingGroup,
      name: gName,
      description: gDesc,
      leaderId: gLeader,
      allUsers: users,
      actor: currentUser,
    });
    setEditingGroup(null);
    onNotify('Đã cập nhật thông tin nhóm việc.');
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    const labels = labelsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await saveSystemConfigByAdmin({
      config: {
        lockHour: Math.min(23, Math.max(0, Number(lockHour) || 23)),
        lockMinute: Math.min(59, Math.max(0, Number(lockMinute) || 59)),
        reminderHour: Math.min(23, Math.max(0, Number(reminderHour) || 17)),
        reminderMinute: Math.min(59, Math.max(0, Number(reminderMinute) || 30)),
        timezone: 'Asia/Ho_Chi_Minh',
        defaultLabels: labels,
      },
      actor: currentUser,
      allUsers: users,
    });
    onNotify('Đã lưu cấu hình phòng ban.');
  }

  async function handleSeedData() {
    setSeeding(true);
    try {
      await seedDepartmentData(currentUser.uid);
      onNotify('Đã khởi tạo đầy đủ dữ liệu mẫu phòng ban.');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap p-1 bg-slate-100 rounded-lg gap-1">
          <button
            type="button"
            onClick={() => setTab('USERS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              tab === 'USERS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Nhân sự & Vai trò ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('GROUPS')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              tab === 'GROUPS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            4 Nhóm việc ({groups.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('CONFIG')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              tab === 'CONFIG' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Cấu hình khóa ngày
          </button>
          <button
            type="button"
            onClick={() => setTab('AUDIT')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              tab === 'AUDIT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Nhật ký hệ thống ({auditLogs.length})
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Database className="w-3.5 h-3.5" />
              {seeding ? 'Đang khởi tạo...' : 'Khởi tạo dữ liệu mẫu'}
            </button>
            <button
              type="button"
              onClick={openCreateUser}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm nhân sự
            </button>
          </div>
        )}
      </div>

      {tab === 'USERS' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Mã NV</th>
                  <th className="py-2.5 px-4">Họ và tên</th>
                  <th className="py-2.5 px-4">Nhóm</th>
                  <th className="py-2.5 px-4">Vai trò RBAC</th>
                  <th className="py-2.5 px-4">Cấp trên trực tiếp</th>
                  <th className="py-2.5 px-4">Trạng thái</th>
                  {isAdmin && <th className="py-2.5 px-4 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {users.map((u) => {
                  const grp = groups.find((g) => g.id === u.groupId);
                  const mgr = users.find((m) => m.uid === u.managerId);
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {u.employeeCode}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{u.fullName}</div>
                        <div className="text-xs text-slate-500">{u.title || '—'}</div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {grp?.name || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700">
                        {u.roles.map((r) => ROLE_LABELS[r]).join(' · ')}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {mgr?.fullName || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                        <span className={u.isActive ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                          {u.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => openEditUser(u)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Sửa
                          </button>
                          {u.uid !== currentUser.uid && (
                            <button
                              type="button"
                              onClick={() => handleToggleLockUser(u)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-red-700"
                            >
                              {u.isActive ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  Khóa
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  Mở
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'GROUPS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((g) => {
            const leader = users.find((u) => u.uid === g.leaderId);
            const members = users.filter((u) => u.groupId === g.id);
            return (
              <div key={g.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs font-semibold text-blue-700">{g.code}</div>
                    <h3 className="text-base font-semibold text-slate-900 mt-0.5">{g.name}</h3>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroup(g);
                        setGName(g.name);
                        setGDesc(g.description || '');
                        setGLeader(g.leaderId);
                      }}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Chỉnh sửa
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-600">{g.description || '—'}</p>
                <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 flex justify-between">
                  <span>
                    Trưởng nhóm: <strong className="text-slate-900">{leader?.fullName || '—'}</strong>
                  </span>
                  <span className="tabular-nums">{members.length} nhân sự</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'CONFIG' && (
        <form
          onSubmit={handleSaveConfig}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            Cấu hình khóa ngày & Nhãn nghiệp vụ (Múi giờ Asia/Ho_Chi_Minh)
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Giờ khóa log work
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="23"
                  disabled={!isAdmin}
                  value={lockHour}
                  onChange={(e) => setLockHour(e.target.value)}
                  className="w-20 px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                />
                <span>:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  disabled={!isAdmin}
                  value={lockMinute}
                  onChange={(e) => setLockMinute(e.target.value)}
                  className="w-20 px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Giờ nhắc nhở cuối ngày
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="23"
                  disabled={!isAdmin}
                  value={reminderHour}
                  onChange={(e) => setReminderHour(e.target.value)}
                  className="w-20 px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                />
                <span>:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  disabled={!isAdmin}
                  value={reminderMinute}
                  onChange={(e) => setReminderMinute(e.target.value)}
                  className="w-20 px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Danh sách nhãn mặc định (phân tách bằng dấu phẩy)
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {isAdmin && (
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
            >
              Lưu cấu hình
            </button>
          )}
        </form>
      )}

      {tab === 'AUDIT' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {auditLogs.length === 0 ? (
            <div className="py-10 px-6 text-center text-sm text-slate-500">
              Chưa có nhật ký hoạt động nào.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="px-5 py-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    {log.actorName} · {log.action}
                  </span>
                  <span className="text-slate-400 tabular-nums">
                    {formatTimestamp(log.createdAt)}
                  </span>
                </div>
                <p className="text-slate-600">{log.detail}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* User Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {editingUser ? `Cập nhật ${editingUser.fullName}` : 'Thêm nhân sự mới'}
              </h3>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mã NV</label>
                  <input
                    type="text"
                    required
                    value={uCode}
                    onChange={(e) => setUCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={uName}
                    onChange={(e) => setUName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email công việc (dùng để đăng nhập)
                  </label>
                  <input
                    type="email"
                    value={uEmail}
                    onChange={(e) => setUEmail(e.target.value)}
                    placeholder="ten@phongban.vn"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Chức danh</label>
                  <input
                    type="text"
                    value={uTitle}
                    onChange={(e) => setUTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nhóm việc</label>
                  <select
                    value={uGroupId}
                    onChange={(e) => setUGroupId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cấp trên trực tiếp
                  </label>
                  <select
                    value={uManagerId}
                    onChange={(e) => setUManagerId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">Không có</option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Vai trò hệ thống (RBAC - chọn nhiều)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ROLE_LABELS) as RoleCode[]).map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-2 text-xs text-slate-800 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={uRoles.includes(r)}
                        onChange={() => toggleRole(r)}
                      />
                      <span>{ROLE_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uActive}
                  onChange={(e) => setUActive(e.target.checked)}
                />
                <span>Tài khoản đang hoạt động (bỏ chọn để khóa)</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
                >
                  {savingUser ? 'Đang lưu...' : 'Lưu nhân sự'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Chỉnh sửa {editingGroup.code}
              </h3>
              <button
                type="button"
                onClick={() => setEditingGroup(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tên nhóm</label>
                <input
                  type="text"
                  required
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mô tả</label>
                <textarea
                  rows={2}
                  value={gDesc}
                  onChange={(e) => setGDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Trưởng nhóm</label>
                <select
                  value={gLeader}
                  onChange={(e) => setGLeader(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.fullName} ({u.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingGroup(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                >
                  Lưu nhóm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
