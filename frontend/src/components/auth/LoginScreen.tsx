import { apiBase } from "../../api";

export function LoginScreen(props: {
  token: string;
  onTokenChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  checking?: boolean;
  error?: string;
}) {
  const busy = props.loading || props.checking;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{'\u767b\u5f55'}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {'\u8bf7\u8f93\u5165\u90e8\u7f72\u65f6\u914d\u7f6e\u7684 token \u7ee7\u7eed\u4f7f\u7528\u3002API\uff1a'}
          {apiBase}
        </p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) {
              props.onSubmit();
            }
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="login-token">
              Token
            </label>
            <input
              id="login-token"
              type="password"
              autoComplete="current-password"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder={'\u8f93\u5165 token'}
              value={props.token}
              onChange={(event) => props.onTokenChange(event.target.value)}
              disabled={busy}
            />
          </div>

          {props.error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{props.error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.checking ? '\u9a8c\u8bc1\u4e2d...' : props.loading ? '\u767b\u5f55\u4e2d...' : '\u767b\u5f55'}
          </button>
        </form>
      </div>
    </div>
  );
}