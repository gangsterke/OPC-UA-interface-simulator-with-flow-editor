import type { TagLiteralValue } from "@shared/models/sequence-step";

export function LiteralValueInput({
  value,
  onChange,
}: {
  value: TagLiteralValue;
  onChange: (value: TagLiteralValue) => void;
}) {
  if (value.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value.value}
        onChange={(e) => onChange({ type: "boolean", value: e.target.checked })}
      />
    );
  }
  if (value.type === "number") {
    return (
      <input
        type="number"
        value={value.value}
        onChange={(e) => onChange({ type: "number", value: Number(e.target.value) })}
        style={{ width: 100 }}
      />
    );
  }
  // int64 and string both edit as plain text (64-bit ints kept as decimal strings).
  return (
    <input
      type="text"
      value={value.value}
      onChange={(e) => onChange({ type: value.type, value: e.target.value } as TagLiteralValue)}
      style={{ width: 140 }}
    />
  );
}
