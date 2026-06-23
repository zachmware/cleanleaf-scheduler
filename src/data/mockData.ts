export interface WorkOrder {
  id: string;
  title: string;
  workType: string;
  priority: number; // 1 to 5
  durationHours: number; // For simplicity in the Gantt, duration is blocks of hours
  region: string; // The territory this job is in
  location?: string; // Maximo location code (e.g. "820-0292")
  status: string;
  assignedTechId?: string;
  startTime?: string; // ISO string representing scheduled startTime 
  checkInTime?: string; // Overrides startTime visually on Gantt
  checkOutTime?: string; // Overrides end time visually on Gantt
  caseNumber?: string;
  caseType?: string;
  projectName?: string;
  projectAddress?: string;
  reportedPriorityText?: string;
  _isAbsoluteEmergency?: boolean;
  bundleOnly?: boolean; // STAGE6B: only schedule when paired with STAGE6 at same location
}

export interface Technician {
  id: string;
  name: string;
  skills: string[];
  timezone: string; // e.g. "America/New_York"
  region: string; // Maximo explicit Territory Region
  homeAddress: string;
}

export const mockTechnicians: Technician[] = [
  { id: 'tech1', name: 'Alex Rodriguez', skills: ['Electrical', 'Cleaning'], timezone: 'America/New_York', region: 'Northeast', homeAddress: '123 Tech Way, NY' },
  { id: 'tech2', name: 'Sarah Jenkins', skills: ['Inverter Repair', 'Diagnostic'], timezone: 'America/Los_Angeles', region: 'West', homeAddress: '456 Solar Blvd, CA' },
  { id: 'tech3', name: 'Michael Chang', skills: ['Roofing', 'Electrical'], timezone: 'America/New_York', region: 'Northeast', homeAddress: '789 Sun Ave, NY' },
  { id: 'tech4', name: 'David Smith', skills: ['General'], timezone: 'America/Denver', region: 'Midwest', homeAddress: '101 Mountain Rd, CO' },
  { id: 'tech5', name: 'Evan Davis', skills: ['General', 'Electrical'], timezone: 'America/Chicago', region: 'Midwest', homeAddress: '101 Central Way, IL' },
];

export const mockRTSWorkOrders: WorkOrder[] = [
  { id: 'wo1', title: 'Field Diagnostics', workType: 'Diagnostic', priority: 1, durationHours: 2, region: 'Midwest', status: 'RTS' },
  { id: 'wo2', title: 'Panel Cleaning Array 4', workType: 'Cleaning', priority: 4, durationHours: 3, region: 'Northeast', status: 'RTS' },
  { id: 'wo3', title: 'Transformer Array B', workType: 'Electrical', priority: 1, durationHours: 4, region: 'Northeast', status: 'RTS' },
  { id: 'wo4', title: 'Routine Inspection', workType: 'Inspection', priority: 5, durationHours: 1, region: 'West', status: 'RTS' },
  { id: 'wo5', title: 'String Inverter Fault', workType: 'Electrical', priority: 2, durationHours: 2, region: 'Midwest', status: 'RTS' },
  { id: 'wo6', title: 'Vegetation Control', workType: 'Maintenance', priority: 5, durationHours: 4, region: 'West', status: 'RTS' },
];

// Helper to reliably generate UTC mock dates for testing
const baseDate = new Date();
// baseDate.setUTCHours(14,0,0,0); // e.g. 10:00 AM NY time
const str1 = new Date(baseDate).setHours(9, 0, 0, 0);

export const mockScheduledOrders: WorkOrder[] = [
  { 
    id: 'wo7', 
    title: 'Emergency Breaker Trip', 
    workType: 'Electrical', 
    priority: 1, 
    durationHours: 3, 
    region: 'Northeast',
    status: 'SCHEDULED',
    assignedTechId: 'tech1',
    // Schedule at 09:00 AM local time today
    startTime: new Date(str1).toISOString()
  }
];
