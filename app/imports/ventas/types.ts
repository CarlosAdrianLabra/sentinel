export type ImportResult = {
  importJobId: number;
  processedCount: number;
};

export type FormState =
  | { status: "idle" }
  | { status: "procesando" }
  | { status: "exito"; result: ImportResult }
  | { status: "error"; mensaje: string };
