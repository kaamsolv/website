import { ToolPageShell } from '@/app/_components/tool-page-shell';
import { DiscountCalculator } from '@/app/_components/calc/everyday-calculators';
import { toolMetadata } from '@/app/lib/tool-metadata';

export const metadata = toolMetadata('/discount-calculator', 'Discount calculator', 'Final price after a discount, how much you save, and stacked discounts like 50% + 20% off. In rupees, free and instant.');

const STEPS = [
  { t: 'Enter the price', d: 'The original price in rupees.' },
  { t: 'Add the discount', d: 'And an extra discount, if the sale has one.' },
  { t: 'See what you pay', d: 'The final price and your saving, instantly.' },
];

const FAQ = [
  { q: 'Is 50% + 20% off the same as 70% off?', a: 'No. The extra 20% comes off the already-reduced price, so it works out to 60% off in total. The calculator shows the real total.' },
  { q: 'Does it include GST?', a: 'It works on whatever price you enter. In India, shop prices usually already include GST.' },
];

export default function Page() {
  return (
    <ToolPageShell slug="discount-calculator" h1="Discount calculator" intro="See the final price after a discount — and what you save." steps={STEPS} faq={FAQ} related={['percentage-calculator', 'gst-calculator', 'tip-calculator']}>
      <DiscountCalculator />
    </ToolPageShell>
  );
}
