/**
 * KaamKit Image Kit — module registry (future navigation).
 *
 * Each module maps to a workspace capability. Only CONVERT is live in Phase 1.
 * Component architecture should accept `module` to allow future routing without rewrites.
 */

export const IMAGE_KIT_MODULES = [
  {
    id: 'convert',
    label: 'Convert',
    description: 'Change image format',
    status: 'live' as const,
    pathPrefix: '/',
  },
  {
    id: 'compress',
    label: 'Compress',
    description: 'Reduce file size',
    status: 'planned' as const,
    pathPrefix: '/compress-image',
  },
  {
    id: 'resize',
    label: 'Resize',
    description: 'Change dimensions',
    status: 'planned' as const,
    pathPrefix: '/resize-image',
  },
  {
    id: 'edit',
    label: 'Edit',
    description: 'Crop, rotate, flip',
    status: 'planned' as const,
    pathPrefix: '/edit-image',
  },
  {
    id: 'clean',
    label: 'Clean',
    description: 'Remove metadata',
    status: 'planned' as const,
    pathPrefix: '/remove-metadata',
  },
  {
    id: 'prepare',
    label: 'Prepare',
    description: 'Social & passport sizes',
    status: 'planned' as const,
    pathPrefix: '/prepare-image',
  },
  {
    id: 'create',
    label: 'Create',
    description: 'Favicon, PDF, contact sheet',
    status: 'planned' as const,
    pathPrefix: '/create-image',
  },
] as const;

export type ImageKitModuleId = (typeof IMAGE_KIT_MODULES)[number]['id'];

export function getLiveModules() {
  return IMAGE_KIT_MODULES.filter((m) => m.status === 'live');
}
