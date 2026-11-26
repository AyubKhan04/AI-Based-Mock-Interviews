// Runs Python in the browser with Pyodide (free, from the jsDelivr CDN), inside a Web Worker
// so an infinite loop can be stopped. Nothing is executed on the server.
const PYODIDE = import.meta.env.VITE_PYODIDE_URL || 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/'

const HARNESS = `
import json, copy, io, sys, traceback, contextlib
def _err():
    et, ev, tb = sys.exc_info()
    where = "".join(f"  line {f.lineno}, in {f.name}\\n" for f in traceback.extract_tb(tb) if f.filename == "solution.py")
    return where + "".join(traceback.format_exception_only(et, ev)).strip()
out = io.StringIO()
res = {"results": [], "error": None}
ns = {}
with contextlib.redirect_stdout(out):
    try:
        exec(compile(USER_CODE, "solution.py", "exec"), ns)
    except Exception:
        res["error"] = _err()
    f = ns.get(FN)
    if res["error"] is None and not callable(f):
        res["error"] = "Define a function called " + FN + "(...)"
    if res["error"] is None:
        for args, expected in json.loads(TESTS_JSON):
            try:
                got = f(*copy.deepcopy(args))
                got_j = json.loads(json.dumps(got, default=str))
                res["results"].append({"ok": got_j == expected, "args": args, "expected": expected, "got": repr(got)})
            except Exception:
                res["results"].append({"ok": False, "args": args, "expected": expected, "error": _err()})
res["stdout"] = out.getvalue()[-4000:]
json.dumps(res)
`

const WORKER = `
importScripts('${PYODIDE}pyodide.js');
const ready = loadPyodide({ indexURL: '${PYODIDE}' }).then((p) => { self.postMessage({ ready: true }); return p });
self.onmessage = async (e) => {
  const p = await ready;
  const { code, fn, tests } = e.data;
  p.globals.set('USER_CODE', code); p.globals.set('FN', fn); p.globals.set('TESTS_JSON', JSON.stringify(tests));
  try { self.postMessage({ result: JSON.parse(await p.runPythonAsync(${JSON.stringify(HARNESS)})) }) }
  catch (err) { self.postMessage({ result: { error: String(err), results: [], stdout: '' } }) }
}`

let worker = null
let readyPromise = null

function boot() {
  worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })))
  readyPromise = new Promise((resolve, reject) => {
    worker.onmessage = (e) => e.data.ready && resolve()
    worker.onerror = (e) => reject(new Error('Could not load Python in the browser: ' + (e.message || 'network error')))
  })
}

export function preload() { if (!worker) boot(); return readyPromise }

/** Run `code`, call `fn` on each [args, expected] test. Resolves to {results, error, stdout}. */
export async function runPython(code, fn, tests, timeoutMs = 5000) {
  await preload()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate(); worker = null
      resolve({ results: [], stdout: '', error: `Time limit exceeded (${timeoutMs / 1000}s). Is there an infinite loop?` })
    }, timeoutMs)
    worker.onmessage = (e) => { if (e.data.result) { clearTimeout(timer); resolve(e.data.result) } }
    worker.postMessage({ code, fn, tests })
  })
}
