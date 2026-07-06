"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function UnlockPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });

    if (response.ok) {
      router.replace("/");
      return;
    }

    setSubmitting(false);
    setError("Código incorrecto. Inténtalo de nuevo.");
  }

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold">bot-estudio</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <label htmlFor="passcode" className="text-sm font-medium">
          Código de acceso
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="off"
          required
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          className="rounded border px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
