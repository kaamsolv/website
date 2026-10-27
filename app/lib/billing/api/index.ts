/**
 * One door for every billing and invoice-sharing route (docs/products/billing.md).
 *
 * Each route file is a one-line wrapper that calls `dispatch`. They all import this module, and this module
 * imports every handler, so every one of these routes pulls the same set of modules into the Worker. Without it
 * the bundler gives each distinct set of routes its own ~255 KB copy of the database layer (measured: +270 KiB
 * gzip for four sets), and the Worker has a hard 3 MiB limit.
 */

import * as webhook from './webhook';
import * as checkout from './checkout';
import * as status from './status';
import * as drain from './drain';
import * as resend from './resend';
import * as link from './link';
import * as invoice_pdf from './invoice-pdf';

type Ctx = { params: Promise<any> };
type Handler = (req: Request, ctx?: any) => Promise<Response> | Response;

const HANDLERS: Record<string, Handler> = {
  'webhook.POST': webhook.handlePOST,
  'checkout.POST': checkout.handlePOST,
  'status.GET': status.handleGET,
  'drain.POST': drain.handlePOST,
  'resend.POST': resend.handlePOST,
  'link.GET': link.handleGET,
  'link.POST': link.handlePOST,
  'link.DELETE': link.handleDELETE,
  'invoice-pdf.GET': invoice_pdf.handleGET,
};

export function dispatch(name: string, req: Request, ctx?: Ctx): Promise<Response> | Response {
  const handler = HANDLERS[name];
  if (!handler) return new Response('Not found', { status: 404 });
  return handler(req, ctx);
}
