export interface DetailColumnFlags {
  hasInvgate: boolean;
  hasInfo: boolean;
  hasSiblings: boolean;
  hasAssets: boolean;
}

export interface DetailColumnLayout {
  hasLeft: boolean;
  hasCenter: boolean;
  hasRight: boolean;
  leftClass: string;
  centerClass: string;
  rightClass: string;
  compactAssets: boolean;
}

/**
 * Computes which detail columns render and their responsive Tailwind widths.
 *
 * The center column holds siblings; `compactAssets` is true whenever the center
 * column exists.
 */
export function getDetailColumnLayout(
  flags: DetailColumnFlags,
): DetailColumnLayout {
  const hasLeft = flags.hasInvgate || flags.hasInfo;
  const hasCenter = flags.hasSiblings;
  const hasRight = flags.hasAssets;

  const columnCount =
    (hasLeft ? 1 : 0) + (hasCenter ? 1 : 0) + (hasRight ? 1 : 0);

  let leftClass = "";
  let centerClass = "";
  let rightClass = "";

  if (columnCount === 1) {
    if (hasLeft) leftClass = "w-full";
    if (hasCenter) centerClass = "w-full";
    if (hasRight) rightClass = "w-full";
  } else if (hasLeft && hasCenter && hasRight) {
    leftClass = "lg:flex-[1.75]";
    centerClass = "lg:flex-[2]";
    rightClass = "lg:flex-[2.25]";
  } else if (hasLeft && hasRight) {
    leftClass = "lg:w-2/5";
    rightClass = "lg:w-3/5";
  } else if (hasLeft && hasCenter) {
    leftClass = "lg:flex-[3]";
    centerClass = "lg:flex-[2]";
  } else if (hasCenter && hasRight) {
    centerClass = "lg:flex-[2]";
    rightClass = "lg:flex-[3]";
  }

  return {
    hasLeft,
    hasCenter,
    hasRight,
    leftClass,
    centerClass,
    rightClass,
    compactAssets: hasCenter,
  };
}
