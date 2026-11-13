import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { CouponGenerator } from '@/app/_components/coupon/coupon-generator';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/coupon-code-generator', 'Coupon code generator', 'Make one or a thousand unique discount codes. Pick a prefix, length and a valid-until date, then copy them or download a CSV. Free, no sign-up, made in your browser.');

const STEPS = [
  { t: 'Say how many', d: 'Drag the sliders for how many codes you want and how long each one is. Add a prefix like SALE if you like.' },
  { t: 'Add the details', d: 'Note the discount and a valid-until date. They travel in the CSV so you can tell your batches apart.' },
  { t: 'Copy or download', d: 'Copy every code, or download a CSV or a plain list. Set up the matching discount in your store or till.' },
];

const FAQ = [
  { q: 'What is a coupon code generator?', a: 'It makes a batch of codes you can hand to customers. This one makes unique, random codes in your browser. You then set up the discount itself in your store, till or booking form, and these are the codes people type in.' },
  { q: 'Does this make the discount work?', a: 'No. A code here is just text. The discount and the date are labels in your file so you can see what each batch was for. Your store or till decides what a code is worth and when it stops working.' },
  { q: 'Can a code be used more than once?', a: 'Nothing on this page stops that. Most stores let you cap how many times a code can be used: look for a usage limit when you set the discount up, and set it to one use for a code you give to one person.' },
  { q: 'Are the codes random and hard to guess?', a: 'Yes. They come from your browser’s secure random generator, and no two codes in a set are the same. The page shows how unlikely a lucky guess is for your settings. Longer codes are harder to guess, so make them longer if a code is worth real money.' },
  { q: 'Why are some letters and digits left out?', a: 'By default the codes skip I, L, O, 0 and 1, which look alike. That makes a code easier to read out over the phone and type without mistakes. You can switch to letters, digits or everything.' },
  { q: 'Can I use the CSV in my store?', a: 'It depends on the store. Shopify’s own help says you can’t import discount codes from a CSV in its admin, and WooCommerce needs a plugin to import coupons from a CSV, with its own column names. So treat the CSV as your master list of codes, with columns named code, discount_type, discount_value and expires_on, and map it to whatever your store or plugin asks for.' },
  { q: 'Can I see which codes were used?', a: 'Not on this page: a code is just text here. Your store, such as Shopify or WooCommerce, shows how many times each code was used.' },
  { q: 'Is anything sent or saved?', a: 'No. The codes are made in your browser and nothing is uploaded or stored. If you close the page, the set is gone, so copy or download it first.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="coupon-code-generator" h1="Coupon code generator" intro="Make one code or a thousand. Copy them or download a CSV. Free, no sign-up." steps={STEPS} faq={FAQ} related={['qr-code-generator', 'invoice-generator', 'url-shortener']}>
      <CouponGenerator />
    </ToolPageShell>
  );
}
