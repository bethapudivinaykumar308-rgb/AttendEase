import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AcademicOptions } from '@/types';

export const ACADEMIC_OPTIONS_KEY = ['academic-options'] as const;

/**
 * Reference data (departments, years, semesters, subjects, sections) used by
 * nearly every filter control. Cached for the life of the session.
 */
export function useAcademicOptions() {
  return useQuery({
    queryKey: ACADEMIC_OPTIONS_KEY,
    queryFn: () => api.get<AcademicOptions>('/api/academic-options'),
    staleTime: 5 * 60 * 1000,
  });
}
