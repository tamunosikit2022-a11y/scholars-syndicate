/** The staff actions that are written to the audit log (table `staff_actions`). */
export const STAFF_ACTIONS = [
  'pack.import',
  'pack.rights',
  'question.edit',
  'question.approve',
  'question.reject',
] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

export const STAFF_TARGET_TYPES = ['pack', 'question'] as const;
export type StaffTargetType = (typeof STAFF_TARGET_TYPES)[number];
