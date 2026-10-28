// Solder's files inside a Run (DT-067 §6–§7). Each file function of a VI is an external wait, as VISA's
// are (instrument-io.mjs): its clump parks, the Run's coordinator asks `io` here, writes the outputs into
// the shared memory and answers, and the clump is woken. No thread of the Run ever blocks on a disk.
//
// `io` is the same as VISA's: the addon in Node (native/solder-io-node), or the editor's I/O process
// through a message port (io-protocol.mjs). Its file operations answer LabVIEW's error codes, 0 for none,
// and take the system's own name of a file, which is made here from the Solder path with the host's rules.
//
// Measured in LabVIEW 2026 Q3 on Windows: labview-captures/reports/2026-10-26-file-io-behavior.md.

import { READ_MODE } from "../compiler/compiler.mjs";
import { EMPTY_PATH, NOT_A_PATH, NOT_A_PATH_TEXT, PATH_KIND, isEmptyPath, isNotAPath, pathFromText, pathToText } from "../model/paths.mjs";

/** What the import answers its clump with: the work is in the outputs it wrote. */
const ANSWERED = 0;
/** Not A Refnum: what a failed open hands on (DT-067 §5). */
const NOT_A_REFNUM = 0;
const NO_ERROR_CODE = 0;
const NO_ERROR = { status: false, code: NO_ERROR_CODE, source: "" };

/** LabVIEW's codes the functions raise here, before asking the I/O (texts in error-codes.mjs). */
const ERROR_CODE = Object.freeze({ INVALID_INPUT: 1, CANCELLED: 43, NOT_AN_ABSOLUTE_PATH: 1430 });

/** Open/Create/Replace File's operation that Write to Text File uses for a path (measured: it replaces or creates). */
const REPLACE_OR_CREATE = 4;
/** And Read from Text File's: it opens, and a missing file is error 7 (measured). */
const OPEN = 0;
const READ_WRITE = 0;

/**
 * The file functions a compiled VI imports, each `(...addresses) → ANSWERED | Promise`. `host` is the Run's
 * createHostFunctions over `memory`; `compilado` gives the error cluster's layout; `pathRules` turns a path
 * into the system's name of the file. Without `io` (an editor with no I/O process yet), a file function
 * fails the Run.
 */
export function createFileFunctions({ io, host, memory, compilado, pathRules }) {
  const view = () => new DataView(memory.buffer);
  const { leerCluster, ponerCluster, putBytes, readBytes, readPath, writePath, functionSource } = host;
  const errorLayout = compilado.disposicionError;
  const readError = (address) => leerCluster(address, errorLayout);
  const writeError = (address, error) => ponerCluster(address, errorLayout, error);
  const writeRefnum = (address, refnum) => view().setUint32(address, refnum, true);
  const writeBoolean = (address, value) => view().setInt32(address, value ? 1 : 0, true);
  const requireIo = () => {
    if (!io) throw new Error("File I/O is not available in this Run.");
    return io;
  };
  // A file function's source is its name, where it ran and, after a line break, the file; with a refnum that
  // is not open it has no file (`fileText` null) and no line break (measured on Close File and Get File Size).
  const sourceOf = (functionName, chainIndex, fileText) =>
    fileText === null ? functionSource(functionName, chainIndex) : `${functionSource(functionName, chainIndex)}<APPEND>\n${fileText}`;
  const errorOf = (code, functionName, chainIndex, fileText) => ({ status: true, code, source: sourceOf(functionName, chainIndex, fileText) });

  /**
   * The system's name of a path the I/O can open, or `null` for one it cannot: Not A Path, the empty path
   * and a relative path are error 1430 in every file function (measured; nothing resolves a relative path).
   */
  const systemNameOf = (path) => (isNotAPath(path) || path.kind === PATH_KIND.RELATIVE || path.components.length === 0 ? null : pathToText(path, pathRules));
  const shownPath = (path) => (isNotAPath(path) ? NOT_A_PATH_TEXT : pathToText(path, pathRules));

  /**
   * The common shape of a file function. With an error in it does no work: the error passes unchanged
   * (unverified for these functions; measured on Close File). Otherwise `work(io)` does it and gives
   * `{ code, fileText }`; a warning that came in passes on when the function raises nothing.
   */
  const fileFunction = (functionName, { errorIn, errorOut, chainIndex }, work) => {
    const incoming = readError(errorIn);
    if (incoming.status) {
      writeError(errorOut, incoming);
      return ANSWERED;
    }
    return Promise.resolve(work(requireIo())).then(({ code, fileText }) => {
      writeError(errorOut, code !== NO_ERROR_CODE ? errorOf(code, functionName, chainIndex, fileText) : incoming.code !== NO_ERROR_CODE ? incoming : NO_ERROR);
      return ANSWERED;
    });
  };

  /**
   * The open file a function works on: the refnum wired, or a path opened with `operation` (measured: Write
   * to Text File replaces or creates, Read from Text File opens; both hand on the open refnum). An unwired
   * file asks for a dialog, which is cancelled until the editor has one (DT-067, amendment of 2026-10-28).
   */
  const openFileOf = async (files, { file, fileIsPath, fileWired, operation }) => {
    if (!fileWired) return { code: ERROR_CODE.CANCELLED, cancelled: true, fileText: NOT_A_PATH_TEXT };
    if (!fileIsPath) {
      const name = await files.fileName(file);
      // A refnum that is not open is error 1, without a file in the source (measured on Get File Size).
      return name === "" ? { code: ERROR_CODE.INVALID_INPUT, fileText: null } : { refnum: file, fileText: name };
    }
    const path = readPath(file);
    const name = systemNameOf(path);
    if (name === null) return { code: ERROR_CODE.NOT_AN_ABSOLUTE_PATH, fileText: shownPath(path) };
    const { refnum, error } = await files.fileOpen(name, operation, READ_WRITE);
    return error !== NO_ERROR_CODE ? { code: error, fileText: name } : { refnum: rememberOpen(refnum), fileText: name };
  };

  // The files this Run opened and has not closed: LabVIEW closes them when the VI finishes, and a refnum kept
  // from an earlier Run is then not open (measured, labview-captures/reports/2026-10-28-file-io-gaps.md Q6).
  const openedHere = new Set();
  const rememberOpen = (refnum) => {
    openedHere.add(refnum);
    return refnum;
  };

  /** Writes `lines` as the elements of a 1D array of strings into `cell`, each as its bytes. */
  const putLines = (cell, lines) => {
    host.ponerArray(cell, { tipo: "string", tam: 4, ref: true }, lines.map(() => ""));
    lines.forEach((line, index) => putBytes(view().getInt32(cell, true) + 8 + 4 * index, line));
  };
  /** The bytes of each element of the 1D array of strings at `handle`. */
  const readLines = (handle) => {
    const block = view().getInt32(handle, true);
    const count = block ? view().getInt32(block, true) : 0;
    return Array.from({ length: count }, (_, index) => readBytes(block + 8 + 4 * index));
  };

  return {
    /** Closes what the Run left open, once it has finished; an I/O that is gone has nothing left to close. */
    closeFilesLeftOpen: async () => {
      const refnums = [...openedHere];
      openedHere.clear();
      if (io) await Promise.allSettled(refnums.map((refnum) => io.fileClose(refnum)));
    },
    file_open: (path, pathWired, operation, access, errorIn, refnumOut, cancelledOut, errorOut, chainIndex) => {
      writeRefnum(refnumOut, NOT_A_REFNUM);
      writeBoolean(cancelledOut, false);
      return fileFunction("Open/Create/Replace File", { errorIn, errorOut, chainIndex }, async (files) => {
        if (!pathWired) {
          writeBoolean(cancelledOut, true);
          return { code: ERROR_CODE.CANCELLED, fileText: NOT_A_PATH_TEXT };
        }
        const wanted = readPath(path);
        const name = systemNameOf(wanted);
        if (name === null) return { code: ERROR_CODE.NOT_AN_ABSOLUTE_PATH, fileText: shownPath(wanted) };
        const { refnum, error } = await files.fileOpen(name, operation, access);
        if (error === NO_ERROR_CODE) rememberOpen(refnum);
        writeRefnum(refnumOut, refnum);
        // Op 5's confirmation is answered Cancel until the editor has the dialog (amendment of 2026-10-28).
        if (error === ERROR_CODE.CANCELLED) writeBoolean(cancelledOut, true);
        return { code: error, fileText: name };
      });
    },

    // Close File gives the file's path; a refnum that is not open is error 1 with no path in the source (measured).
    file_close: (refnum, errorIn, pathCell, errorOut, chainIndex) => {
      writePath(pathCell, EMPTY_PATH);
      const incoming = readError(errorIn);
      return Promise.resolve(requireIo().fileClose(refnum)).then(({ name, error }) => {
        if (error === NO_ERROR_CODE) {
          openedHere.delete(refnum);
          writePath(pathCell, pathFromText(name, pathRules));
        }
        // Measured: an error in passes unchanged, the file is still closed and its path comes; an error of
        // its own replaces a warning.
        const own = error !== NO_ERROR_CODE ? { status: true, code: error, source: functionSource("Close File", chainIndex) } : null;
        writeError(errorOut, incoming.status ? incoming : (own ?? (incoming.code !== NO_ERROR_CODE ? incoming : NO_ERROR)));
        return ANSWERED;
      });
    },

    // With an error in, Write to Text File gives Not A Refnum while Read from Text File passes its refnum (measured).
    file_write_text: (file, fileIsPath, fileWired, text, textIsLines, convertEol, errorIn, refnumOut, cancelledOut, errorOut, chainIndex) => {
      writeRefnum(refnumOut, fileIsPath || !fileWired || readError(errorIn).status ? NOT_A_REFNUM : file);
      writeBoolean(cancelledOut, false);
      return fileFunction("Write to Text File", { errorIn, errorOut, chainIndex }, async (files) => {
        const opened = await openFileOf(files, { file, fileIsPath, fileWired, operation: REPLACE_OR_CREATE });
        if (opened.cancelled) writeBoolean(cancelledOut, true);
        if (opened.code !== undefined) {
          // A refnum that is not open gives Not A Refnum (measured).
          writeRefnum(refnumOut, NOT_A_REFNUM);
          return opened;
        }
        writeRefnum(refnumOut, opened.refnum);
        const code = textIsLines ? await files.fileWriteLines(opened.refnum, readLines(text), !!convertEol) : await files.fileWrite(opened.refnum, readBytes(text), !!convertEol);
        return { code, fileText: opened.fileText };
      });
    },

    file_read_text: (file, fileIsPath, fileWired, count, readMode, convertEol, errorIn, refnumOut, textCell, cancelledOut, errorOut, chainIndex) => {
      writeRefnum(refnumOut, fileIsPath || !fileWired ? NOT_A_REFNUM : file);
      writeBoolean(cancelledOut, false);
      if (readMode === READ_MODE.LINES) putLines(textCell, []);
      else putBytes(textCell, new Uint8Array(0));
      return fileFunction("Read from Text File", { errorIn, errorOut, chainIndex }, async (files) => {
        const opened = await openFileOf(files, { file, fileIsPath, fileWired, operation: OPEN });
        if (opened.cancelled) writeBoolean(cancelledOut, true);
        if (opened.code !== undefined) {
          // A refnum that is not open gives Not A Refnum (measured).
          writeRefnum(refnumOut, NOT_A_REFNUM);
          return opened;
        }
        writeRefnum(refnumOut, opened.refnum);
        if (readMode === READ_MODE.LINES) {
          const { lines, error } = await files.fileReadLines(opened.refnum, count);
          putLines(textCell, lines);
          return { code: error, fileText: opened.fileText };
        }
        const { text, error } =
          readMode === READ_MODE.NEXT_LINE ? await files.fileReadLine(opened.refnum, !!convertEol) : await files.fileRead(opened.refnum, count, !!convertEol);
        putBytes(textCell, text);
        return { code: error, fileText: opened.fileText };
      });
    },

    // By path it opens the file and hands on the open refnum (measured); with an error in, Not A Refnum.
    file_size: (file, fileIsPath, errorIn, refnumOut, sizeOut, errorOut, chainIndex) => {
      // Unverified: what refnum out gives with an error in and a refnum wired; here the refnum passes.
      writeRefnum(refnumOut, fileIsPath ? NOT_A_REFNUM : file);
      view().setBigInt64(sizeOut, 0n, true);
      return fileFunction("Get File Size", { errorIn, errorOut, chainIndex }, async (files) => {
        const opened = await openFileOf(files, { file, fileIsPath, fileWired: true, operation: OPEN });
        if (opened.code !== undefined) {
          // A refnum that is not open gives Not A Refnum (measured).
          writeRefnum(refnumOut, NOT_A_REFNUM);
          return opened;
        }
        writeRefnum(refnumOut, opened.refnum);
        const { size, error } = await files.fileSize(opened.refnum);
        view().setBigInt64(sizeOut, BigInt(size), true);
        return { code: error, fileText: opened.fileText };
      });
    },

    // Delete: the deleted path is the one given, also on an error (a relative one too), except an empty path
    // or Not A Path, which give the empty path (measured). Confirm asks with a dialog, cancelled until the editor has one, as op 5
    // (DT-067, amendment of 2026-10-28).
    file_delete: (path, pathWired, entireHierarchy, confirm, errorIn, deletedPathCell, cancelledOut, errorOut, chainIndex) => {
      const wanted = pathWired ? readPath(path) : NOT_A_PATH;
      const name = systemNameOf(wanted);
      // Unverified: the deleted path of an unwired path's cancelled dialog.
      writePath(deletedPathCell, pathWired && (isNotAPath(wanted) || isEmptyPath(wanted)) ? EMPTY_PATH : wanted);
      writeBoolean(cancelledOut, false);
      return fileFunction("Delete", { errorIn, errorOut, chainIndex }, async (files) => {
        if (!pathWired) {
          writeBoolean(cancelledOut, true);
          return { code: ERROR_CODE.CANCELLED, fileText: NOT_A_PATH_TEXT };
        }
        if (name === null) return { code: ERROR_CODE.NOT_AN_ABSOLUTE_PATH, fileText: shownPath(wanted) };
        if (confirm) {
          writeBoolean(cancelledOut, true);
          return { code: ERROR_CODE.CANCELLED, fileText: name };
        }
        return { code: await files.fileDelete(name, !!entireHierarchy), fileText: name };
      });
    },
  };
}

/** The names of the file imports, the ones a pool thread hands to the coordinator. */
export const FILE_FUNCTION_NAMES = ["file_open", "file_close", "file_write_text", "file_read_text", "file_size", "file_delete"];
