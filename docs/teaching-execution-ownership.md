# Teaching Execution Ownership

Status: implemented with conservative fencing; not universal orphan recovery.

`run_owned` reserves a durable owner record before a gated subprocess can execute Node.
It binds the UUID job directory, host process group and a random execution nonce. It
checks the reserved inode against path replacement, bounds output, and passes only
explicit environment fields, never provider credentials.

Docker execution records bind the same nonce to a full immutable container ID, image,
job label and exact name. Cleanup operations address that ID, not a potentially reused
name. A positive host exit without a valid cleanup proof remains interrupted.

On reconciliation, the program may remove a positively observed container only if all
owner/execution/label bindings match and the original host process group is absent.
It rechecks ownership before removal and verifies ID/name absence afterward. It never
signals a persisted PID or removes an unknown container. Database locks are not held
while waiting on Docker. Successful cleanup releases the deletion fence, not the task's
failure state; it does not publish a video or rerun generation.

Missing records, symlinks, ambiguous container absence, a live/reused process group or
an unavailable Docker daemon remain fenced. Absence alone is not proof that an unknown
executor has stopped. These cases are not reported as automatic recovery success.

## Evidence

- Unit tests cover nonce/identity mismatches, unsafe files, live groups, output limits,
  process termination and missing cleanup receipts.
- Node lifecycle tests cover immutable-ID cleanup and metadata/label propagation.
- An opt-in real Docker test creates a uniquely owned orphan using a trusted fixed
  test driver, waits for its host group to exit, then verifies scoped removal and proof.
  No model-generated source or paid interface is involved.
