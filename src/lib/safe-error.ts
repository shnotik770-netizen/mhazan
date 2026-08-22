// Postgres/PostgREST error messages (constraint names, column names, RLS
// policy text, SQLSTATE codes) are useful for debugging but reveal
// internal schema/authorization details when returned straight to the
// client. In development the raw message is kept for fast debugging;
// in production it's replaced with a generic message while the real
// detail still goes to the server log.
export function safeErrorMessage(error: { message: string } | null | undefined): string | undefined {
  if (!error) return undefined;
  if (process.env.NODE_ENV !== "production") return error.message;
  console.error("[server action error]", error.message);
  return "אירעה שגיאה בשמירה. נסו שוב, ואם זה חוזר על עצמו פנו למנהל המערכת.";
}
