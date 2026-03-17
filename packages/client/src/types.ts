import type { IOptions } from "soap";

export type OperationDefinition = {
  input: unknown;
  output: unknown;
};

export type ServiceDefinition = {
  [service: string]: {
    [port: string]: {
      [operation: string]: OperationDefinition;
    };
  };
};

/**
 * Transforms a static service definition into a callable client interface.
 * Each `{ input: I; output: O }` becomes `(input: I) => Promise<O>`.
 */
export type InferClient<T extends ServiceDefinition> = {
  [S in keyof T]: {
    [P in keyof T[S]]: {
      [O in keyof T[S][P]]: T[S][P][O] extends OperationDefinition
        ? (input: T[S][P][O]["input"]) => Promise<T[S][P][O]["output"]>
        : never;
    };
  };
};

export interface SoapClientOptions extends IOptions {
  /**
   * Override the SOAP endpoint URL. If provided, this replaces
   * the `<soap:address location="...">` from the WSDL.
   */
  endpoint?: string;
}
