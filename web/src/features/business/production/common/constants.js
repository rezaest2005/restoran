export const STATUSES = ["planned", "in_progress", "completed", "cancelled"];

let keySeq = 0;
/** Unique React key for a new (unsaved) formulation line. */
export const newKey = () => `l${++keySeq}`;
