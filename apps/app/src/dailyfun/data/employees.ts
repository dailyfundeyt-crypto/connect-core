export interface Employee {
  id: string;
  name: string;
  image: string;
  descriptionDe: string;
  descriptionEn: string;
  categories: string[];
  categoriesEn: string[];
}

export const employees: Employee[] = [
  {
    id: 'stefan',
    name: 'Stefan Kunc',
    image: '/lovable-uploads/dd996217-e9c4-456c-af16-469f05791ad2.png',
    descriptionDe: 'Gründer und Visionär von Daily Fun. Experte für Unternehmensführung, Innovation und digitale Transformation.',
    descriptionEn: 'Founder and Visionary of Daily Fun. Expert in business leadership, innovation and digital transformation.',
    categories: ['Wirtschaft', 'Innovation', 'Leadership'],
    categoriesEn: ['Business', 'Innovation', 'Leadership']
  },
  {
    id: 'elke',
    name: 'Dr. Elke Schneider',
    image: '/lovable-uploads/2679b50f-c4f9-40d5-bbce-828296880ba2.png',
    descriptionDe: 'Leiterin für Humor & Kreativität. Spezialistin für Wissenschaft, Psychologie und unterhaltsame Bildung.',
    descriptionEn: 'Head of Humor & Creativity. Specialist in science, psychology and entertaining education.',
    categories: ['Wissenschaft', 'Psychologie', 'Humor'],
    categoriesEn: ['Science', 'Psychology', 'Humor']
  },
  {
    id: 'karl',
    name: 'Herr Karl Bergmann',
    image: '/lovable-uploads/afb210bd-6729-403e-857a-9271499984f4.png',
    descriptionDe: 'Lead Story Weaver. Experte für Gesellschaft, Politik und komplexe Themenaufbereitung.',
    descriptionEn: 'Lead Story Weaver. Expert in society, politics and complex topic preparation.',
    categories: ['Gesellschaft', 'Politik', 'Geschichte'],
    categoriesEn: ['Society', 'Politics', 'History']
  },
  {
    id: 'jonas',
    name: 'Herr Jonas Richter',
    image: '/lovable-uploads/3e2b5f3d-bb10-4914-847d-e40fa0928943.png',
    descriptionDe: 'Content-Alchemist. Spezialist für Technologie, Gaming und visuelle Medien.',
    descriptionEn: 'Content Alchemist. Specialist in technology, gaming and visual media.',
    categories: ['Technology', 'Gaming', 'Medien'],
    categoriesEn: ['Technology', 'Gaming', 'Media']
  }
];

// Map author names to employee IDs for search functionality
export const getEmployeeByAuthor = (authorName: string): Employee | null => {
  // Direct name matches
  const directMatch = employees.find(emp => emp.name === authorName);
  if (directMatch) return directMatch;

  // Partial matches (for variations like "Karl Bergmann" vs "Herr Karl Bergmann")
  return employees.find(emp => {
    const empNameParts = emp.name.toLowerCase().split(' ');
    const authorParts = authorName.toLowerCase().split(' ');
    
    // Check if any significant name parts match (excluding titles like "Herr", "Dr.")
    const significantEmpParts = empNameParts.filter(part => !['herr', 'dr.', 'dr'].includes(part));
    const significantAuthorParts = authorParts.filter(part => !['herr', 'dr.', 'dr'].includes(part));
    
    return significantAuthorParts.some(authorPart => 
      significantEmpParts.some(empPart => empPart.includes(authorPart) || authorPart.includes(empPart))
    );
  }) || null;
};