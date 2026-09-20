const { z } = require('zod');

const createShipmentSchema = z.object({
  trackingNumber: z.string().optional(), // Optional, auto-generated if omitted
  referenceNumber: z.string().optional(),
  sender: z.object({
    name: z.string().min(1, 'Sender name is required'),
    email: z.string().email('Valid sender email required'),
    phone: z.string().min(1, 'Sender phone is required'),
    address: z.string().optional(),
    company: z.string().optional()
  }),
  recipient: z.object({
    name: z.string().min(1, 'Recipient name is required'),
    email: z.string().email('Valid recipient email required'),
    phone: z.string().min(1, 'Recipient phone is required'),
    address: z.string().optional(),
    company: z.string().optional()
  }),
  origin: z.object({
    address: z.string().min(1, 'Origin address is required'),
    city: z.string().min(1, 'Origin city is required'),
    state: z.string().optional(),
    country: z.string().min(1, 'Origin country is required'),
    postalCode: z.string().optional(),
    coordinates: z
      .object({
        lat: z.number(),
        lng: z.number()
      })
      .optional()
  }),
  destination: z.object({
    address: z.string().min(1, 'Destination address is required'),
    city: z.string().min(1, 'Destination city is required'),
    state: z.string().optional(),
    country: z.string().min(1, 'Destination country is required'),
    postalCode: z.string().optional(),
    coordinates: z
      .object({
        lat: z.number(),
        lng: z.number()
      })
      .optional()
  }),
  package: z
    .object({
      description: z.string().min(1, 'Package description is required'),
      category: z.string().optional(),
      weight: z.object({
        value: z.number().min(0),
        unit: z.enum(['kg', 'lbs']).default('kg')
      }),
      dimensions: z
        .object({
          length: z.number().optional().default(0),
          width: z.number().optional().default(0),
          height: z.number().optional().default(0),
          unit: z.enum(['cm', 'inch']).default('cm')
        })
        .optional(),
      quantity: z.number().min(1).default(1),
      declaredValue: z
        .object({
          amount: z.number().optional().default(0),
          currency: z.string().optional().default('USD')
        })
        .optional(),
      isFragile: z.boolean().optional().default(false),
      isPerishable: z.boolean().optional().default(false)
    })
    .optional(),
  serviceType: z
    .enum([
      'standard_express',
      'priority_air',
      'ocean_freight',
      'road_cargo',
      'road_transport',
      'express_courier',
      'diplomatic_secure',
      'diplomatic',
      'overnight'
    ])
    .optional()
    .default('standard_express'),
  transportMode: z.string().optional().default('Air'),
  carrier: z.string().optional().default('Express Cargo'),
  status: z
    .enum([
      'pending',
      'active',
      'in_transit',
      'paused',
      'suspended',
      'confiscated',
      'on_hold',
      'customs_hold',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned'
    ])
    .default('active'),
  statusReason: z.string().optional(),
  durationHours: z.number().min(0.001).default(24),
  dispatchDate: z.string().or(z.date()).optional(),
  estimatedDeliveryDate: z.string().or(z.date()).optional(),
  assignedCustomer: z.string().optional(),
  assignedStaff: z.string().optional(),
  notes: z.string().optional(),
  isDiplomaticSeal: z.boolean().optional().default(false),
  checkpoints: z
    .array(
      z.object({
        checkpointName: z.string(),
        city: z.string(),
        country: z.string(),
        coordinates: z.object({
          lat: z.number(),
          lng: z.number()
        }),
        estimatedArrival: z.string().or(z.date()).optional(),
        notes: z.string().optional()
      })
    )
    .optional()
});

module.exports = {
  createShipmentSchema
};

