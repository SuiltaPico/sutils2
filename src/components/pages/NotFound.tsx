import { A } from "@solidjs/router";

export default function NotFound() {
  return (
    <div class="flex flex-col items-center justify-center h-screen">
      <h1 class="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p class="text-lg mb-8">The page you are looking for does not exist.</p>
      <A href="/" class="text-blue-500 hover:underline">
        Go back to Home
      </A>
    </div>
  );
}
