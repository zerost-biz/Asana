import type { TimeEntry, WbsItem } from '../domain/types'

/** テスト用: 作業項目（最下位タスク）の雛形 */
export const wbs = (o: Partial<WbsItem> = {}): WbsItem => ({
  id: 'x',
  projectId: 'p',
  parentId: null,
  type: 'task',
  title: 't',
  ownerId: 'u-k',
  startDate: '2026-10-12',
  endDate: '2026-10-16',
  planHours: 10,
  etcHours: 5,
  progress: 0,
  status: 'in_progress',
  priority: 'medium',
  baselinePlanHours: o.planHours ?? 10,
  baselineStart: o.startDate ?? '2026-10-12',
  baselineEnd: o.endDate ?? '2026-10-16',
  statusChangedAt: '2026-10-12',
  etcUpdatedAt: '2026-10-12',
  ...o,
})

export const entry = (o: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'e',
  userId: 'u-k',
  projectId: 'p',
  wbsId: 'x',
  date: '2026-10-12',
  hours: 1,
  comment: '',
  ...o,
})

/** 2026-10-12 は月曜日 */
export const MONDAY = new Date(2026, 9, 12)
export const MONDAY_ISO = '2026-10-12'
