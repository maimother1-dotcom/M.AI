"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

const SUBJECTS = [
  "An order",
  "Returns or exchanges",
  "Sizing advice",
  "A product question",
  "Press",
  "Something else",
];

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: SUBJECTS[0]!, message: "" });
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.message ?? "Something went wrong. Try again.");
        return;
      }

      setStatus("done");
      setMessage(data.message);
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="border border-gold/40 p-8">
        <p className="font-display text-2xl">Message received</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="eyebrow mb-2 block">
            Name
          </label>
          <input
            id="c-name"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border-b border-ink/25 bg-transparent px-1 py-3 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label htmlFor="c-email" className="eyebrow mb-2 block">
            Email
          </label>
          <input
            id="c-email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border-b border-ink/25 bg-transparent px-1 py-3 text-sm outline-none focus:border-ink"
          />
        </div>
      </div>

      <div>
        <label htmlFor="c-subject" className="eyebrow mb-2 block">
          Subject
        </label>
        <select
          id="c-subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          className="w-full cursor-pointer border-b border-ink/25 bg-transparent px-1 py-3 text-sm outline-none focus:border-ink"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="c-message" className="eyebrow mb-2 block">
          Message
        </label>
        <textarea
          id="c-message"
          required
          rows={6}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="w-full resize-y border border-line bg-transparent p-4 text-sm outline-none focus:border-ink"
        />
      </div>

      {/* Honeypot */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label htmlFor="c-website">Leave empty</label>
        <input
          id="c-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {status === "error" && (
        <p role="alert" className="text-sm text-madder">
          {message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={status === "loading"}>
        {status === "loading" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
