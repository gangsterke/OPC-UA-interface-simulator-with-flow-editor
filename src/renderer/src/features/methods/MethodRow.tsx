import { useState } from "react";
import { useMethodsStore } from "./methods-store";
import { LiteralValueInput } from "../sequence/LiteralValueInput";
import { literalKindForDataType, defaultLiteralForKind } from "../sequence/literal-value";
import type { MethodDefinition } from "@shared/models/method";
import type { TagLiteralValue } from "@shared/models/sequence-step";

function summarizeArgs(args: MethodDefinition["inputArguments"]): string {
  if (args.length === 0) return "(none)";
  return args.map((a) => `${a.name}: ${a.dataType}${a.valueRank !== -1 ? "[]" : ""}`).join(", ");
}

function isUnsupportedArg(a: { dataType: string; valueRank: number }): boolean {
  return a.dataType === "Unknown" || a.valueRank !== -1;
}

function defaultInputValues(method: MethodDefinition): TagLiteralValue[] {
  return method.inputArguments.map((a) => defaultLiteralForKind(literalKindForDataType(a.dataType)));
}

type TestCallResult = { ok: true; outputs: { name: string; display: string }[] } | { ok: false; error: string };

export function MethodRow({ method }: { method: MethodDefinition }) {
  const renameMethod = useMethodsStore((s) => s.renameMethod);
  const removeMethod = useMethodsStore((s) => s.removeMethod);
  const [alias, setAlias] = useState(method.alias);
  const [inputValues, setInputValues] = useState<TagLiteralValue[]>(() => defaultInputValues(method));
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<TestCallResult | null>(null);

  function commitAlias(): void {
    const trimmed = alias.trim();
    if (trimmed && trimmed !== method.alias) {
      renameMethod(method.id, trimmed);
    } else {
      setAlias(method.alias);
    }
  }

  const hasUnsupportedArg = [...method.inputArguments, ...method.outputArguments].some(isUnsupportedArg);
  const hasUnsupportedInput = method.inputArguments.some(isUnsupportedArg);

  async function runTestCall(): Promise<void> {
    setCalling(true);
    setResult(null);
    try {
      const callResult = await window.api.method.testCall(method, inputValues);
      setResult(callResult);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setCalling(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0", borderBottom: "1px solid #eee" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          onBlur={commitAlias}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitAlias();
          }}
          style={{ width: 140 }}
        />
        <button onClick={() => removeMethod(method.id)}>Remove</button>
      </div>
      <div style={{ fontSize: 12, color: "#666" }}>in: {summarizeArgs(method.inputArguments)}</div>
      <div style={{ fontSize: 12, color: "#666" }}>out: {summarizeArgs(method.outputArguments)}</div>
      {hasUnsupportedArg && (
        <div style={{ fontSize: 12, color: "#c92a2a" }}>
          Has a structured/array argument - not editable as a constant in this version.
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: 8,
          marginTop: 4,
          background: "#f8f8f8",
          border: "1px solid #ddd",
        }}
      >
        {method.inputArguments.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>(no input arguments)</div>
        ) : (
          method.inputArguments.map((arg, index) =>
            isUnsupportedArg(arg) ? (
              <div key={index} style={{ fontSize: 12, color: "#c92a2a" }}>
                {arg.name}: structured/array - cannot enter a literal value
              </div>
            ) : (
              <div key={index} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 90, fontSize: 13 }}>
                  {arg.name} <span style={{ color: "#999" }}>({arg.dataType})</span>
                </span>
                <LiteralValueInput
                  value={inputValues[index]}
                  onChange={(value) => setInputValues((prev) => prev.map((v, i) => (i === index ? value : v)))}
                />
              </div>
            )
          )
        )}
        <div>
          <button onClick={runTestCall} disabled={calling || hasUnsupportedInput}>
            {calling ? "Calling…" : "Call"}
          </button>
        </div>
        {result &&
          (result.ok ? (
            <div style={{ fontSize: 12, color: "#2b8a3e" }}>
              {result.outputs.length === 0
                ? "Call succeeded (no output arguments)."
                : result.outputs.map((o) => `${o.name}=${o.display}`).join(", ")}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#c92a2a" }}>{result.error}</div>
          ))}
      </div>
    </div>
  );
}
