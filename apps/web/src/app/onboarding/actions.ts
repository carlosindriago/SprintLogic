"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function createOrganization(formData: FormData) {
  const name = formData.get("name") as string;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return redirect("/login");
  }

  // Obtenemos la session para tener el token JWT
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    return redirect("/login");
  }

  // Llamada al endpoint de API local u host
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  
  const res = await fetch(`${apiUrl}/organizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    return redirect(`/onboarding?message=${encodeURIComponent(errData.message || "Error al crear la organización")}`);
  }

  // Si se crea correctamente, redirigimos al home o dashboard
  redirect("/");
}
