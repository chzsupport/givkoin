type RegisterMessagesProps = {
  error: string | null;
  errors: string[];
  message: string | null;
};

export function RegisterMessages({ error, errors, message }: RegisterMessagesProps) {
  return (
    <>
      {errors.length > 0 && (
        <div className="rounded-lg bg-rose-500/10 p-3 text-body text-rose-200 border border-rose-500/20">
          {errors[0]}
        </div>
      )}
      {message && (
        <div className="rounded-lg bg-emerald-500/10 p-3 text-body text-emerald-200 border border-emerald-500/20">
          {message}
        </div>
      )}
      {error && !message && (
        <div className="rounded-lg bg-rose-500/10 p-3 text-body text-rose-200 border border-rose-500/20">
          {error}
        </div>
      )}
    </>
  );
}
