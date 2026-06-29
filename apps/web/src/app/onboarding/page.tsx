import { createOrganization } from "./actions";

export default async function OnboardingPage(props: { searchParams: Promise<{ message: string }> }) {
  const searchParams = await props.searchParams;

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto pt-20">
      <form className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground">
        <h1 className="text-2xl font-bold mb-4 text-center">Crea tu Organización</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">
          Para comenzar a usar SprintLogic, necesitas crear una organización.
        </p>

        <label className="text-md" htmlFor="name">
          Nombre de la Organización
        </label>
        <input
          className="rounded-md px-4 py-2 bg-inherit border mb-6"
          name="name"
          placeholder="Mi Empresa Inc."
          required
        />
        
        <button
          formAction={createOrganization}
          className="bg-blue-600 rounded-md px-4 py-2 text-white mb-2"
        >
          Crear Organización
        </button>

        {searchParams?.message && (
          <p className="mt-4 p-4 bg-foreground/10 text-red-500 text-center">
            {searchParams.message}
          </p>
        )}
      </form>
    </div>
  );
}
