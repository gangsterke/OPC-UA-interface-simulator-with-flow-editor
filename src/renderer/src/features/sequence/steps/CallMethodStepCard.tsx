import { useSequenceStore } from "../sequence-store";
import { useMethodsStore } from "../../methods/methods-store";
import { ValueSourceEditor } from "../ValueSourceEditor";
import type { CallMethodStep } from "@shared/models/sequence-step";

export function CallMethodStepCard({ step }: { step: CallMethodStep }) {
  const methods = useMethodsStore((s) => s.methods);
  const setStepMethod = useSequenceStore((s) => s.setStepMethod);
  const setInputArgumentSource = useSequenceStore((s) => s.setInputArgumentSource);
  const method = methods.find((m) => m.id === step.methodId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Call</span>
        <select
          value={step.methodId ?? ""}
          onChange={(e) => {
            const next = methods.find((m) => m.id === e.target.value);
            if (next) setStepMethod(step.id, next);
          }}
        >
          <option value="" disabled>
            Select method…
          </option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.alias}
            </option>
          ))}
        </select>
        {methods.length === 0 && <span style={{ fontSize: 12, color: "#999" }}>(drag a Method node into Methods first)</span>}
      </div>

      {method && method.inputArguments.length === 0 && (
        <p style={{ fontSize: 12, color: "#999", marginLeft: 16 }}>(no input arguments)</p>
      )}

      {method?.inputArguments.map((argumentMeta, index) => (
        <div key={index} style={{ marginLeft: 16 }}>
          <ValueSourceEditor
            stepId={step.id}
            dndFieldId={`callMethod.${index}`}
            label={argumentMeta.name}
            dataType={argumentMeta.dataType}
            source={step.inputArguments[index]}
            onChange={(source) => setInputArgumentSource(step.id, index, source)}
          />
        </div>
      ))}

      {method && method.outputArguments.length > 0 && (
        <p style={{ fontSize: 12, color: "#999", marginLeft: 16 }}>
          outputs: {method.outputArguments.map((a) => `${a.name} (${a.dataType})`).join(", ")}
        </p>
      )}
    </div>
  );
}
