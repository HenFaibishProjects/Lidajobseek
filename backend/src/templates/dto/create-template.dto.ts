export class CreateTemplateDto {
  name!: string;
  versions!: { label: string; content: string }[];
}
