const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/packages?search=wedding&category=wedding&city=Mumbai&minPrice=&maxPrice=&minRating=&sort=price_asc|price_desc|rating|newest
// Public: the main search endpoint the homepage search bar and browse/filter page use.
// Only returns packages from approved vendors.
router.get("/", async (req, res) => {
  const { search, category, city, minPrice, maxPrice, minRating, sort } = req.query;

  const orderBy =
    sort === "price_asc" ? { price: "asc" } :
    sort === "price_desc" ? { price: "desc" } :
    sort === "rating" ? { vendor: { rating: "desc" } } :
    { createdAt: "desc" }; // "newest" / default

  const packages = await prisma.package.findMany({
    where: {
      vendor: {
        status: "APPROVED",
        ...(category ? { category: String(category) } : {}),
        ...(city ? { city: { contains: String(city) } } : {}),
        ...(minRating ? { rating: { gte: Number(minRating) } } : {}),
      },
      ...(search
        ? {
            OR: [
              { name: { contains: String(search) } },
              { description: { contains: String(search) } },
            ],
          }
        : {}),
      ...(minPrice ? { price: { gte: Number(minPrice) } } : {}),
      ...(maxPrice ? { price: { lte: Number(maxPrice) } } : {}),
    },
    include: { vendor: true },
    orderBy,
  });

  res.json(packages);
});

// GET /api/packages/:id
// Public: a single package's details, for a product-detail-style view.
router.get("/:id", async (req, res) => {
  const pkg = await prisma.package.findUnique({
    where: { id: Number(req.params.id) },
    include: { vendor: true },
  });
  if (!pkg || pkg.vendor.status !== "APPROVED") {
    return res.status(404).json({ error: "Package not found" });
  }
  res.json(pkg);
});

// GET /api/packages/:id/suggestions
// Public: "you might also like" — other packages in the same category (preferring
// the same city), excluding this one. Used on the product detail page.
router.get("/:id/suggestions", async (req, res) => {
  const pkg = await prisma.package.findUnique({
    where: { id: Number(req.params.id) },
    include: { vendor: true },
  });
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  // Prefer same category + same city first, then same category anywhere,
  // then just fill remaining slots with other approved packages.
  const sameCategorySameCity = await prisma.package.findMany({
    where: {
      id: { not: pkg.id },
      vendor: { status: "APPROVED", category: pkg.vendor.category, city: pkg.vendor.city },
    },
    include: { vendor: true },
    take: 4,
  });

  let suggestions = sameCategorySameCity;
  if (suggestions.length < 4) {
    const more = await prisma.package.findMany({
      where: {
        id: { not: pkg.id, notIn: suggestions.map((s) => s.id) },
        vendor: { status: "APPROVED", category: pkg.vendor.category },
      },
      include: { vendor: true },
      take: 4 - suggestions.length,
    });
    suggestions = suggestions.concat(more);
  }
  if (suggestions.length < 4) {
    const more = await prisma.package.findMany({
      where: { id: { not: pkg.id, notIn: suggestions.map((s) => s.id) }, vendor: { status: "APPROVED" } },
      include: { vendor: true },
      orderBy: { createdAt: "desc" },
      take: 4 - suggestions.length,
    });
    suggestions = suggestions.concat(more);
  }

  res.json(suggestions);
});

module.exports = router;
