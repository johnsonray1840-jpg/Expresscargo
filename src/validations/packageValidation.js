const { z } = require('zod');

const packageSchema = z.object({
  shipmentId: z.string().optional(),
  trackingNumber: z.string().optional(),
  description: z.string().min(1, 'Package description is required'),
  category: z
    .enum(['documents', 'electronics', 'apparel', 'diplomatic_pouch', 'medical', 'fragile', 'heavy_machinery', 'general_cargo'])
    .default('general_cargo'),
  weight: z.object({
    value: z.number().min(0, 'Weight must be non-negative'),
    unit: z.enum(['kg', 'lbs']).default('kg')
  }),
  dimensions: z
    .object({
      length: z.number().min(0).default(0),
      width: z.number().min(0).default(0),
      height: z.number().min(0).default(0),
      unit: z.enum(['cm', 'inch']).default('cm')
    })
    .optional(),
  quantity: z.number().min(1).default(1),
  declaredValue: z
    .object({
      amount: z.number().min(0).default(0),
      currency: z.string().default('USD')
    })
    .optional(),
  isFragile: z.boolean().default(false),
  isPerishable: z.boolean().default(false)
});

const updatePackageSchema = packageSchema.partial();

module.exports = {
  packageSchema,
  updatePackageSchema
};

