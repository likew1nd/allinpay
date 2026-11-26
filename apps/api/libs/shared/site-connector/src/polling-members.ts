export type PollingMember = {
  channelCode: string;
  weight: number;
  position: number;
};

/** Membership changes preserve every unaffected member and its order/weight. */
export function validateMemberChange(
  action: string,
  current: PollingMember[],
  desired: PollingMember[],
  channelCode: unknown,
) {
  if (action === 'SET_POLLING_MEMBER_WEIGHTS') {
    if (
      desired.length !== current.length ||
      desired.some(
        (row, index) =>
          row.channelCode !== current[index].channelCode ||
          row.position !== current[index].position,
      )
    )
      throw new Error('INVALID_MEMBERS');
    return;
  }
  if (typeof channelCode !== 'string' || !/^\d{1,20}$/.test(channelCode))
    throw new Error('INVALID_TARGET');
  if (action === 'ADD_POLLING_MEMBER') {
    const added = desired[desired.length - 1];
    if (
      desired.length !== current.length + 1 ||
      !added ||
      added.channelCode !== channelCode ||
      current.some((row) => row.channelCode === channelCode) ||
      added.position !== current.length ||
      added.weight > 100 ||
      JSON.stringify(desired.slice(0, -1)) !== JSON.stringify(current)
    )
      throw new Error('INVALID_MEMBER_ADDITION');
    return;
  }
  if (action === 'REMOVE_POLLING_MEMBER') {
    if (!desired.length) throw new Error('LAST_MEMBER_REQUIRED');
    const expected = current
      .filter((row) => row.channelCode !== channelCode)
      .map((row, position) => ({ ...row, position }));
    if (
      desired.length !== current.length - 1 ||
      JSON.stringify(desired) !== JSON.stringify(expected)
    )
      throw new Error('INVALID_MEMBER_REMOVAL');
    return;
  }
  throw new Error('INVALID_ACTION');
}
