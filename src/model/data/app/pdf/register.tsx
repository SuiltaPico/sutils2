import { registerFunction, registerDisplayNodeRenderer, evalExpression, evalTerm, type EvalContext } from "../../display/renderer";

export function register_pdf() {
  // All heavy parsing is now in syntax.ts.
  // This file is for registering display-side helper functions or custom renderers.

  // Example: a function to build a data URL for an image object, to be called from display.tsx
  registerFunction("pdf::build_image_data_url", (obj: any) => {
    if (!obj?.is_stream || !obj?.dict) return undefined;
    
    const filter = obj.dict.Filter?.value;
    const subtype = obj.dict.Subtype?.value;
    if (subtype !== "Image") return undefined;

    let mime = "";
    if (filter === "DCTDecode") mime = "image/jpeg";
    // TODO: Add more filters like JPXDecode, FlateDecode (requires a DEFLATE implementation)
    else return `data:text/plain,unsupported_filter:${filter}`;
    
    // In a real implementation, we would need the actual stream bytes here.
    // The syntactic model needs to be enhanced to include stream data.
    const streamBytes = obj.stream_bytes || new Uint8Array([/* placeholder */]);
    
    let binary = '';
    const len = streamBytes.length;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(streamBytes[i]);
    }
    const b64 = btoa(binary);

    return `data:${mime};base64,${b64}`;
  });

  // Custom renderer for the <pdf_image_map> node type
  registerDisplayNodeRenderer("pdf_image_map", (node: any, ctx: EvalContext) => {
    let url: any;
    const prov = node.url_provider;
    if (prov) {
      url = prov.type === "expr" ? evalExpression(ctx, prov.expr) : evalTerm(ctx, prov);
    }
    if (!url) return undefined;
    return <img src={String(url)} style={node.style ?? "max-width: 480px; border: 1px solid #eee;"} />;
  });
}


