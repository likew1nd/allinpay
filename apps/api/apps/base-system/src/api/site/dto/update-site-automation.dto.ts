import { IsBoolean } from 'class-validator';

export class UpdateSiteAutomationDto {
  @IsBoolean()
  paused!: boolean;
}
