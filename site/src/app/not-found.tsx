import { categories } from "@/data/categories";
import { Motif } from "@/components/brand/Motif";
import { ButtonLink, Container } from "@/components/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-28 text-center lg:py-40">
      <Motif className="h-20 w-20 text-gold/60" />

      <p className="eyebrow mt-9">Error 404</p>
      <h1 className="mt-4 text-balance text-4xl sm:text-5xl lg:text-6xl">
        This page was not woven
      </h1>
      <p className="mt-6 max-w-md text-pretty text-sm leading-relaxed text-ink-soft">
        The page you are looking for does not exist, or has moved. The collection is only
        seventy-four pieces, so it will not take long to find what you were after.
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/shop">Shop everything</ButtonLink>
        <ButtonLink href="/search" variant="secondary">
          Search
        </ButtonLink>
      </div>

      <nav className="mt-14 border-t border-line pt-10">
        <p className="eyebrow mb-5">Or browse a category</p>
        <ul className="flex flex-wrap justify-center gap-x-7 gap-y-3">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={`/shop/${category.slug}`} className="link-underline text-sm text-ink-soft">
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Container>
  );
}
