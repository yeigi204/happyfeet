/** Die ersten `premoderationCount` Posts eines Creators werden vorab geprüft, danach direkt freigegeben. */
export function initialModerationStatus(
  approvedPostCount: number,
  premoderationCount: number,
): "pending" | "approved" {
  return approvedPostCount < premoderationCount ? "pending" : "approved";
}
