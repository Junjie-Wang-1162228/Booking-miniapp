import { BoxingClass } from './types';

export function isBookableClass(boxingClass: BoxingClass, now = new Date()) {
  if (boxingClass.status !== 'SCHEDULED') return false;
  if (new Date(boxingClass.startsAt).getTime() <= now.getTime()) return false;
  return true;
}

export function filterBookableClasses(classList: BoxingClass[], now = new Date()) {
  return classList.filter((boxingClass) => isBookableClass(boxingClass, now));
}
