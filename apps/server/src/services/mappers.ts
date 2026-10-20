import type {
  Alert,
  CodeListItem,
  CodeStatus,
  Employee,
  Me,
  MyTask,
  MyUpdate,
  Project,
  Task,
  TaskStatusCounts,
  Update,
  WorkSession,
} from '@lk/shared';
import type {
  AccessCode,
  Project as ProjectRow,
  User,
  WorkSession as WorkSessionRow,
} from '../generated/prisma/client';
import { dbDateToString } from '../lib/clock';
import type { AlertRow } from '../repositories/alert.repository';
import type { ProgressUpdateRow } from '../repositories/progress-update.repository';
import type { TaskRow } from '../repositories/task.repository';

// Explicit field lists: password hashes, code hashes and face templates can never leak
// into a response by accident.

export function toMe(user: User): Me {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    jobRoleId: user.jobRoleId,
    deviceMode: user.deviceMode,
    idleIntervalMin: user.idleIntervalMin,
    faceEnrolled: user.faceTemplate !== null,
  };
}

export function toEmployee(user: User): Employee {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    joiningDate: dbDateToString(user.joiningDate),
    status: user.status,
    jobRoleId: user.jobRoleId,
    deviceMode: user.deviceMode,
    idleIntervalMin: user.idleIntervalMin,
    faceEnrolled: user.faceTemplate !== null,
    faceModelVersion: user.faceModelVersion,
    createdAt: user.createdAt.toISOString(),
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
  };
}

/** The status as of `now`, even if the expiry job has not run yet. */
export function effectiveCodeStatus(code: AccessCode, now: Date): CodeStatus {
  if (code.status === 'ACTIVE' && code.expiresAt <= now) return 'EXPIRED';
  if (code.status === 'CLAIMED' && code.claimExpiresAt && code.claimExpiresAt <= now) {
    return 'EXPIRED';
  }
  return code.status;
}

export function toCodeListItem(code: AccessCode, now: Date): CodeListItem {
  return {
    id: code.id,
    purpose: code.purpose,
    status: effectiveCodeStatus(code, now),
    deviceMode: code.deviceMode,
    presetJobRoleId: code.presetJobRoleId,
    note: code.note,
    targetUserId: code.targetUserId,
    registeredUserId: code.registeredUserId,
    expiresAt: code.expiresAt.toISOString(),
    claimExpiresAt: code.claimExpiresAt?.toISOString() ?? null,
    createdAt: code.createdAt.toISOString(),
  };
}

export function toWorkSession(session: WorkSessionRow): WorkSession {
  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason,
    lastHeartbeatAt: session.lastHeartbeatAt?.toISOString() ?? null,
  };
}

/** The employee's view: no owner wording, no assignee details. */
export function toMyTask(task: TaskRow): MyTask {
  return {
    id: task.id,
    title: task.title,
    descriptionTechnical: task.descriptionTechnical,
    jobRoleId: task.jobRoleId,
    priority: task.priority,
    status: task.status,
    source: task.source,
    blockedReason: task.blockedReason,
    assignedAt: task.assignedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    updatedAt: task.updatedAt.toISOString(),
    project: task.project
      ? {
          id: task.project.id,
          title: task.project.title,
          summaryTechnical: task.project.summaryTechnical,
        }
      : null,
  };
}

export function toTask(task: TaskRow): Task {
  return {
    ...toMyTask(task),
    projectId: task.projectId,
    descriptionOriginal: task.descriptionOriginal,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee?.name ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

export function emptyTaskCounts(): TaskStatusCounts {
  return { UNASSIGNED: 0, PENDING: 0, IN_PROGRESS: 0, BLOCKED: 0, COMPLETED: 0 };
}

export function toProject(project: ProjectRow, counts: TaskStatusCounts): Project {
  return {
    id: project.id,
    title: project.title,
    briefOriginal: project.briefOriginal,
    summaryTechnical: project.summaryTechnical,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    counts,
  };
}

/** The employee's own update. A task that was moved to someone else is not named any more. */
export function toMyUpdate(update: ProgressUpdateRow): MyUpdate {
  const ownTask = update.task && update.task.assigneeId === update.employeeId ? update.task : null;
  return {
    id: update.id,
    task: ownTask ? { id: ownTask.id, title: ownTask.title } : null,
    textTechnical: update.textTechnical,
    textPlain: update.textPlain,
    blockers: update.blockers,
    createdAt: update.createdAt.toISOString(),
    readByOwnerAt: update.readByOwnerAt?.toISOString() ?? null,
  };
}

export function toUpdate(update: ProgressUpdateRow): Update {
  return {
    ...toMyUpdate(update),
    employeeId: update.employeeId,
    employeeName: update.employee.name,
    task: update.task
      ? { id: update.task.id, title: update.task.title, status: update.task.status }
      : null,
  };
}

export function toAlert(alert: AlertRow): Alert {
  return {
    id: alert.id,
    kind: alert.kind,
    employeeId: alert.userId,
    employeeName: alert.user?.name ?? null,
    idleReason: alert.idleReason,
    score: alert.score,
    securityKind: alert.securityKind,
    message: alert.message,
    at: alert.at.toISOString(),
    receivedAt: alert.receivedAt.toISOString(),
    notified: alert.notified,
    ownerAckAt: alert.ownerAckAt?.toISOString() ?? null,
  };
}
