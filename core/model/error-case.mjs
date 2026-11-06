// The frames of a Case Structure whose selector is an error cluster (DT-083). LabVIEW selects them by
// status and code: "No Error" runs when the status is F (a warning too), and otherwise the frame whose
// codes hold the code, written as in a numeric Case after the word "Error": "Error 7", "Error 1..5",
// and "Error .." for any code, an open range, which becomes the Default once a frame of codes is added.
//
// Measured: labview-captures/reports/2026-11-06-case-error-selector.md and -2.md. A pure module, shared by the
// editor, the compiler and the tests.

/** The value of the No Error frame. The other values are codes: integers and ranges `{ min, max }`. */
export const NO_ERROR = Object.freeze({ noError: true });

/** The value of the frame for any code, shown "Error ..": a range with neither end. */
export const ANY_ERROR = Object.freeze({});

export const isNoError = (value) => value?.noError === true;

const isBound = (bound) => bound === undefined || Number.isInteger(bound);

/** Whether `value` can stand in an error Case: No Error, a code, or a range of codes. */
export function isErrorFrameValue(value) {
  if (isNoError(value)) return true;
  if (Number.isInteger(value)) return true;
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => key === "min" || key === "max") && isBound(value.min) && isBound(value.max);
}

/** Whether `value` is "Error ..": any code, a range with neither end. */
export const isAnyErrorValue = (value) => !!value && typeof value === "object" && !isNoError(value) && value.min === undefined && value.max === undefined;

/** Whether the frames leave no selector value without a frame: No Error and any code are both there. */
export function coversEveryError(frames) {
  const values = frames.flatMap((frame) => frame.valores ?? []);
  return values.some(isNoError) && values.some(isAnyErrorValue);
}

/**
 * The values a frame takes when an error cluster is wired to a Case that had a Boolean selector: the
 * True frame becomes No Error and the False frame "Error .." (measured, Q3). A numeric frame keeps its
 * numbers, which become codes.
 */
export function errorValuesFromBoolean(values) {
  return values.map((value) => (value === true ? NO_ERROR : value === false ? ANY_ERROR : value));
}
