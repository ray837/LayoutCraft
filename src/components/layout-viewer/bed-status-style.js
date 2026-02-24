export const BED_STATUS_OPTIONS = [
  "Vacant",
  "Payment Due",
  "Occupied",
  "Maintenance",
  "Notice Period",
];

const BED_STATUS_COLORS = {
  "payment due": { outer: "#fee2e2", inner: "#fecaca", stripe: "#dc2626" },
  occupied: { outer: "#fef3c7", inner: "#fde68a", stripe: "#b45309" },
  maintenance: { outer: "#e2e8f0", inner: "#cbd5e1", stripe: "#64748b" },
  "notice period": { outer: "#e9d5ff", inner: "#f3e8ff", stripe: "#9333ea" },
};

const normalizeBedStatus = (status) => String(status || "").trim().toLowerCase();
const BED_STATUS_ALIAS_MAP = {
  available: "Vacant",
  vacant: "Vacant",
  "payment due": "Payment Due",
  "payment-due": "Payment Due",
  occupied: "Occupied",
  reserved: "Occupied",
  "checked-in today": "Occupied",
  "extended stay": "Occupied",
  "temporary occupied (short stay)": "Occupied",
  "vacating today": "Notice Period",
  "notice period": "Notice Period",
  maintenance: "Maintenance",
  maintanance: "Maintenance",
  cleaning: "Maintenance",
  "inspection pending": "Maintenance",
  "hold / blocked": "Maintenance",
  "no show": "Payment Due",
  "shifted (moved to another bed)": "Vacant",
  ready: "Vacant",
};

export const getCanonicalBedStatus = (status) => {
  const normalized = normalizeBedStatus(status);
  if (!normalized) return "Vacant";
  if (BED_STATUS_ALIAS_MAP[normalized]) return BED_STATUS_ALIAS_MAP[normalized];
  const match = BED_STATUS_OPTIONS.find((option) => option.toLowerCase() === normalized);
  return match || "Vacant";
};

export const getBedVisualStyle = ({ status, selected = false }) => {
  const canonical = getCanonicalBedStatus(status);
  const normalized = normalizeBedStatus(canonical);
  const isVacant = normalized === "vacant";
  const palette = BED_STATUS_COLORS[normalized];
  const outline = selected ? "#d97706" : "#b45309";

  if (isVacant) {
    return {
      outline,
      outerFill: "transparent",
      innerFill: "transparent",
      stripeFill: selected ? "#2563eb" : "#94a3b8",
      pillowFill: "#d1d5db",
    };
  }

  return {
    outline,
    outerFill: palette?.outer || "#f5deb3",
    innerFill: palette?.inner || "#fef3c7",
    stripeFill: selected ? "#2563eb" : palette?.stripe || "#94a3b8",
    pillowFill: "#d1d5db",
  };
};
