/// <reference types="vite/client" />

declare module "virtual:page-metadata" {
  const metadata: Record<string, string>;
  export default metadata;
}