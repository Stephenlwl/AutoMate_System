import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, getDocs, Timestamp, doc, getDoc, onSnapshot, DocumentData, orderBy } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, map, switchMap } from 'rxjs';

interface Bay {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  serviceCenterId: string;
}

interface TimeSlot {
  time: string;
  date: Date;
  isAvailable: boolean;
  isOperatingHour: boolean;
  bookings?: any[];
  occupiedBays?: string[];
  bookingStatuses?: string[];
}

interface DaySchedule {
  date: Date;
  dateString: string;
  dayName: string;
  isToday: boolean;
  isPast: boolean;
  timeSlots: TimeSlot[];
  operatingHours?: {
    open: string;
    close: string;
    isClosed: boolean;
  };
}

interface ServiceBooking {
  id: string;
  scheduledDate: Timestamp;
  scheduledTime: string;
  estimatedDuration: number;
  status: string;
  bayId?: string;
  vehicle: {
    plateNumber: string;
    make: string;
    model: string;
  };
  services: Array<{
    serviceName: string;
    duration: number;
  }>;
}

interface OperatingHours {
  day: string;
  isClosed: boolean;
  open: string;
  close: string;
}
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class ServiceCenterDashboardComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  serviceCenterId!: string;
  loading = true;

  serviceStats: any[] = [];
  towingStats: any[] = [];
  todayBookings: any[] = [];

  bays: Bay[] = [];
  schedule: DaySchedule[] = [];
  selectedDateRange = new BehaviorSubject<'week' | 'month' | 'year'>('week');
  currentStartDate = new BehaviorSubject<Date>(this.getWeekStart(new Date()));
  selectedBay: string | 'all' = 'all';
  overallStartTime: string = '09:00';
  overallEndTime: string = '18:00';
  // Real-time unsubscribe functions
  private serviceBookingsUnsubscribe: (() => void) | null = null;
  private towingRequestsUnsubscribe: (() => void) | null = null;
  private todayBookingsUnsubscribe: (() => void) | null = null;

  async ngOnInit() {
    this.serviceCenterId = this.auth.getServiceCenterId();
    if (!this.serviceCenterId) return;

    await this.setupRealTimeListeners();
    combineLatest([this.selectedDateRange, this.currentStartDate])
      .pipe(
        switchMap(([range, startDate]) => this.loadTimelineData(range, startDate))
      )
      .subscribe();
    this.loading = false;
  }

  ngOnDestroy() {
    // Clean up all real-time listeners
    if (this.serviceBookingsUnsubscribe) {
      this.serviceBookingsUnsubscribe();
    }
    if (this.towingRequestsUnsubscribe) {
      this.towingRequestsUnsubscribe();
    }
    if (this.todayBookingsUnsubscribe) {
      this.todayBookingsUnsubscribe();
    }
    this.selectedDateRange.complete();
    this.currentStartDate.complete();
  }

  private async setupRealTimeListeners() {
    await this.setupServiceBookingsListener();
    await this.setupTowingRequestsListener();
    await this.setupTodayBookingsListener();
  }

  private async setupServiceBookingsListener() {
    const q = query(
      collection(this.firestore, 'service_bookings'),
      where('serviceCenterId', '==', this.serviceCenterId)
    );

    this.serviceBookingsUnsubscribe = onSnapshot(q, async (snapshot) => {
      console.log('Service bookings real-time update:', snapshot.docs.length, 'documents');
      // Update service stats
      const statsDefs = [
        { label: 'Pending', status: 'pending', icon: 'bi-hourglass-split' },
        { label: 'Confirmed', status: 'confirmed', icon: 'bi-check-circle' },
        { label: 'Assigned', status: 'assigned', icon: 'bi-person-check' },
        { label: 'In Progress', status: 'in_progress', icon: 'bi-play-circle' },
        { label: 'Ready to Collect', status: 'ready_to_collect', icon: 'bi-car-front' },
        { label: 'Completed', status: 'completed', icon: 'bi-flag' },
      ];

      this.serviceStats = await this.buildStatsFromSnapshot(snapshot, statsDefs);
    });
  }

  private async setupTowingRequestsListener() {
    const q = query(
      collection(this.firestore, 'towing_requests'),
      where('serviceCenterId', '==', this.serviceCenterId)
    );

    this.towingRequestsUnsubscribe = onSnapshot(q, async (snapshot) => {
      // Update towing stats
      const statsDefs = [
        { label: 'Pending', status: 'pending', icon: 'bi-truck' },
        { label: 'Accepted', status: 'accepted', icon: 'bi-check-circle' },
        { label: 'Dispatched', status: 'dispatched', icon: 'bi-person-check' },
        { label: 'Ongoing', status: 'ongoing', icon: 'bi-geo-alt' },
        { label: 'Towing Service Completed', status: 'invoice_generated', icon: 'bi-car-front' },
        { label: 'Completed', status: 'completed', icon: 'bi-flag' },
      ];

      this.towingStats = await this.buildStatsFromSnapshot(snapshot, statsDefs);
    });
  }

  private async setupTodayBookingsListener() {
    // Get today's date boundaries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Service bookings for today
    const todaySvcQuery = query(
      collection(this.firestore, 'service_bookings'),
      where('serviceCenterId', '==', this.serviceCenterId),
      where('scheduledDate', '>=', Timestamp.fromDate(todayStart)),
      where('scheduledDate', '<=', Timestamp.fromDate(todayEnd)),
      where('status', 'not-in', ['completed', 'declined', 'cancelled'])
    );

    // Towing requests for today
    const todayTowQuery = query(
      collection(this.firestore, 'towing_requests'),
      where('serviceCenterId', '==', this.serviceCenterId),
      where('createdAt', '>=', Timestamp.fromDate(todayStart)),
      where('createdAt', '<=', Timestamp.fromDate(todayEnd)),
      where('status', 'not-in', ['completed', 'declined', 'cancelled'])
    );

    // Set up listeners for both collections
    const svcUnsubscribe = onSnapshot(todaySvcQuery, async (snapshot) => {
      const serviceBookings = await this.processServiceBookings(snapshot.docs);
      await this.updateTodayBookings(serviceBookings, 'service');
    });

    const towUnsubscribe = onSnapshot(todayTowQuery, async (snapshot) => {
      const towingBookings = await this.processTowingRequests(snapshot.docs);
      await this.updateTodayBookings(towingBookings, 'towing');
    });

    // Store both unsubscribe functions
    this.todayBookingsUnsubscribe = () => {
      svcUnsubscribe();
      towUnsubscribe();
    };
  }

  private async buildStatsFromSnapshot(snapshot: any, defs: any[]): Promise<any[]> {
    const results: any[] = [];

    for (const def of defs) {
      const count = snapshot.docs.filter((doc: any) => {
        const data = doc.data();
        return data['status'] === def.status;
      }).length;

      results.push({ ...def, value: count });
    }

    return results;
  }

  private async processServiceBookings(docs: any[]): Promise<any[]> {
    const bookings = await Promise.all(
      docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        const customerDetails = await this.getCustomerDetails(data['userId']);
        const technicianDetails = data['technicianId'] ? await this.getTechnicianDetails(data['technicianId']) : null;
        const bayDetails = data['bayId'] ? await this.getBayDetails(data['bayId']) : null;

        return {
          id: docSnapshot.id,
          ...data,
          type: 'service',
          customer: customerDetails || { name: 'N/A', email: 'N/A', phone: 'N/A' },
          vehicle: data['vehicle'] || { plateNumber: 'N/A', make: 'N/A', model: 'N/A', year: 'N/A' },
          technician: technicianDetails,
          bay: bayDetails,
          status: data['status'] || 'pending',
          scheduledDate: data['scheduledDate'] || null,
          scheduledTime: data['scheduledTime'] || 'N/A',
          createdAt: data['createdAt'] || null
        };
      })
    );

    return bookings;
  }

  private async processTowingRequests(docs: any[]): Promise<any[]> {
    const requests = await Promise.all(
      docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        const customerDetails = await this.getCustomerDetails(data['userId']);
        const driverDetails = data['driverId'] ? await this.getDriverDetails(data['driverId']) : null;

        return {
          id: docSnapshot.id,
          ...data,
          type: 'towing',
          customer: customerDetails || { name: 'N/A', email: 'N/A', phone: 'N/A' },
          vehicleInfo: data['vehicleInfo'] || { plateNumber: 'N/A', make: 'N/A', model: 'N/A' },
          driver: driverDetails,
          driverVehicleInfo: data['driverVehicleInfo'] || null,
          status: data['status'] || 'pending',
          towingType: data['towingType'] || 'General Towing',
          createdAt: data['createdAt'] || null,
          location: data['location'] || { address: 'N/A' }
        };
      })
    );

    return requests;
  }

  private async updateTodayBookings(newBookings: any[], type: string) {
    // Remove existing bookings of this type
    this.todayBookings = this.todayBookings.filter(booking => booking.type !== type);
    // Add new bookings
    this.todayBookings = [...this.todayBookings, ...newBookings];

    // Sort service booking by scheduled date , and for towing request by creation date
    this.todayBookings.sort((a: any, b: any) => {
      const dateA = a.scheduledDate?.toDate() || a.createdAt?.toDate() || new Date(0);
      const dateB = b.scheduledDate?.toDate() || b.createdAt?.toDate() || new Date(0);
      return dateA.getTime() - dateB.getTime();
    });
  }

  private async getCustomerDetails(userId: string): Promise<any> {
    if (!userId) return null;

    try {
      const carOwnerDoc = doc(this.firestore, 'car_owners', userId);
      const carOwnerSnapshot = await getDoc(carOwnerDoc);

      if (carOwnerSnapshot.exists()) {
        const carOwnerData = carOwnerSnapshot.data();
        return {
          name: carOwnerData['name'] || 'N/A',
          email: carOwnerData['email'] || 'N/A',
          phone: carOwnerData['phone'] || 'N/A'
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching customer details:', error);
      return null;
    }
  }

  private async getTechnicianDetails(technicianId: string): Promise<any> {
    try {
      const technicianDoc = doc(this.firestore, 'staffs', technicianId);
      const technicianSnapshot = await getDoc(technicianDoc);

      if (technicianSnapshot.exists()) {
        const technicianData = technicianSnapshot.data();
        return {
          name: technicianData['name'] || 'N/A',
          email: technicianData['email'] || 'N/A',
          phone: technicianData['phoneNo'] || 'N/A'
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching technician details:', error);
      return null;
    }
  }

  private async getBayDetails(bayId: string): Promise<any> {
    try {
      const bayDoc = doc(this.firestore, 'bays', bayId);
      const baySnapshot = await getDoc(bayDoc);

      if (baySnapshot.exists()) {
        const bayData = baySnapshot.data();
        return {
          name: bayData['name'] || 'N/A',
          notes: bayData['notes'] || 'No description'
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching bay details:', error);
      return null;
    }
  }

  private async getDriverDetails(driverId: string): Promise<any> {
    try {
      const driverDoc = doc(this.firestore, 'drivers', driverId);
      const driverSnapshot = await getDoc(driverDoc);

      if (driverSnapshot.exists()) {
        const driverData = driverSnapshot.data();
        return {
          name: driverData['name'] || 'N/A',
          phone: driverData['phoneNo'] || 'N/A',
          vehicle: {
            make: driverData['make'] || 'N/A',
            model: driverData['model'] || 'N/A',
            plate: driverData['carPlate'] || 'N/A'
          }
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching driver details:', error);
      return null;
    }
  }

  getDisplayTime(booking: any): string {
    if (booking.type === 'service' && booking.scheduledTime) {
      return booking.scheduledTime;
    } else if (booking.createdAt) {
      return booking.createdAt.toDate().toLocaleTimeString('en-MY', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return 'Not scheduled';
  }

  getVehicleDisplay(booking: any): string {
    if (booking.type === 'towing') {
      const vehicle = booking.vehicleInfo;
      if (vehicle.plateNumber) {
        return `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.sizeClass || ''} - (${vehicle.plateNumber})`.trim();
      }
      return `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.sizeClass || ''} `.trim() || 'N/A';
    } else if (booking.type === 'service') {
      const vehicle = booking.vehicle;
      if (vehicle.plateNumber) {
        return `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.sizeClass || ''} - (${vehicle.plateNumber})`.trim();
      }
      return `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.sizeClass || ''}`.trim() || 'N/A';
    }
    return 'N/A';
  }

  getAssignmentInfo(booking: any): string {
    if (booking.type === 'service') {
      if (booking.technician && booking.bay) {
        return `${booking.technician.name} - ${booking.bay.name}`;
      } else if (booking.technician) {
        return booking.technician.name;
      } else if (booking.bay) {
        return booking.bay.name;
      }
      return 'Not assigned';
    } else if (booking.type === 'towing') {
      if (booking.driver) {
        return `${booking.driver.name} - ${booking.driver.vehicle.make} ${booking.driver.vehicle.model}`;
      }
      return 'Not assigned';
    }
    return 'N/A';
  }

  getStatusBadgeClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'bg-warning text-dark',
      'confirmed': 'bg-info text-white',
      'accepted': 'bg-info text-white',
      'assigned': 'bg-primary text-white',
      'dispatched': 'bg-primary text-white',
      'in_progress': 'bg-warning text-dark',
      'ongoing': 'bg-warning text-dark',
      'invoice_generated': 'bg-secondary text-white',
      'ready_to_collect': 'bg-success text-white',
      'completed': 'bg-success text-white',
      'declined': 'bg-danger text-white'
    };
    return classes[status] || 'bg-secondary';
  }

  async loadTimelineData(range: 'week' | 'month' | 'year', startDate: Date) {
    this.loading = true;
    try {
      await this.loadBays();
      const serviceCenterData = await this.loadServiceCenterData();
      const bookings = await this.loadBookings(range, startDate);
      this.generateTimeline(range, startDate, serviceCenterData, bookings);
      this.debugTimeSlotBookings();
    } catch (error) {
      console.error('Failed to load timeline data', error);
      alert('Failed to load timeline data: ' + error);
    } finally {
      this.loading = false;
    }
  }

  async loadBays() {
    const baysQuery = query(
      collection(this.firestore, 'bays'),
      where('serviceCenterId', '==', this.serviceCenterId),
      where('active', '==', true)
    );

    const snapshot = await getDocs(baysQuery);
    this.bays = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Bay));
  }

  async loadServiceCenterData() {
    const docRef = doc(this.firestore, 'service_centers', this.serviceCenterId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }
    throw new Error('Service center not found');
  }

  async loadBookings(range: 'week' | 'month' | 'year', startDate: Date) {
    let endDate: Date;

    switch (range) {
      case 'week':
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      case 'month':
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        break;
      case 'year':
        endDate = new Date(startDate.getFullYear(), 11, 31);
        break;
    }

    const startTimestamp = Timestamp.fromDate(new Date(startDate.setHours(0, 0, 0, 0)));
    const endTimestamp = Timestamp.fromDate(new Date(endDate.setHours(23, 59, 59, 999)));

    const bookingsQuery = query(
      collection(this.firestore, 'service_bookings'),
      where('serviceCenterId', '==', this.serviceCenterId),
      where('scheduledDate', '>=', startTimestamp),
      where('scheduledDate', '<=', endTimestamp),
      where('status', 'in', ['pending', 'approved', 'assigned', 'in_progress', 'ready_to_collect', 'invoice_generated', 'completed']),
      orderBy('scheduledDate'),
      orderBy('scheduledTime')
    );

    const snapshot = await getDocs(bookingsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ServiceBooking));
  }

  generateTimeline(range: 'week' | 'month' | 'year', startDate: Date, serviceCenterData: any, bookings: ServiceBooking[]) {
    this.schedule = [];

    const days = this.getDateRange(range, startDate);

    days.forEach(day => {
      const daySchedule = this.createDaySchedule(day, serviceCenterData, bookings);
      this.schedule.push(daySchedule);
    });

    // Calculate overall operating hours for the current period
    this.calculateOverallOperatingHours();
  }

  createDaySchedule(date: Date, serviceCenterData: any, bookings: ServiceBooking[]): DaySchedule {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateString = date.toISOString().split('T')[0];

    const isSpecialClosure = serviceCenterData.specialClosures?.some(
      (closure: any) => closure.date === dateString
    );

    const operatingHours = serviceCenterData.operatingHours?.find(
      (oh: any) => oh.day === dayName
    );

    const isClosed = isSpecialClosure || operatingHours?.isClosed;

    const daySchedule: DaySchedule = {
      date: date,
      dateString: dateString,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: this.isToday(date),
      isPast: this.isPast(date),
      timeSlots: [],
      operatingHours: isClosed ? undefined : {
        open: operatingHours?.open || '09:00',
        close: operatingHours?.close || '18:00',
        isClosed: false
      }
    };

    if (isClosed) {
      // For closed days will still generate slots but mark them as non-operating
      daySchedule.timeSlots = this.generateEmptySlotsForDay(date);
    } else {
      daySchedule.timeSlots = this.generateOperatingSlotsForDay(date, operatingHours, bookings);
    }

    return daySchedule;
  }

  calculateOverallOperatingHours() {
    const operatingDays = this.schedule.filter(day => day.operatingHours && !day.operatingHours.isClosed);

    if (operatingDays.length === 0) {
      this.overallStartTime = '09:00';
      this.overallEndTime = '18:00';
      return;
    }

    // Find the earliest open time and latest close time across all operating days
    let earliestOpen = '23:59';
    let latestClose = '00:00';

    operatingDays.forEach(day => {
      if (day.operatingHours) {
        if (day.operatingHours.open < earliestOpen) {
          earliestOpen = day.operatingHours.open;
        }
        if (day.operatingHours.close > latestClose) {
          latestClose = day.operatingHours.close;
        }
      }
    });

    this.overallStartTime = earliestOpen;
    this.overallEndTime = latestClose;
  }

  isBayAvailableForTimeSlot(occupiedBays: string[]): boolean {
    if (this.selectedBay === 'all') {
      // Check if any bays are available
      return occupiedBays.length < this.bays.length;
    } else {
      // Check if the selected bay is available
      return !occupiedBays.includes(this.selectedBay);
    }
  }

  generateOperatingSlotsForDay(date: Date, operatingHours: any, bookings: ServiceBooking[]): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const dateString = date.toISOString().split('T')[0];

    const openTime = operatingHours?.open || '09:00';
    const closeTime = operatingHours?.close || '18:00';

    const [openHour, openMinute] = openTime.split(':').map(Number);
    const [closeHour, closeMinute] = closeTime.split(':').map(Number);

    let currentTime = new Date(date);
    currentTime.setHours(openHour, openMinute, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(closeHour, closeMinute, 0, 0);

    // Get all bookings for this day
    const dayBookings = bookings.filter(booking => {
      const bookingDate = booking.scheduledDate.toDate().toISOString().split('T')[0];
      return bookingDate === dateString;
    });

    while (currentTime < endTime) {
      const timeString = currentTime.toTimeString().slice(0, 5);

      // Find ALL bookings that occupy this time slot
      const slotBookings = this.getBookingsForTimeSlot(dayBookings, timeString);
      const occupiedBays = this.getOccupiedBaysForTimeSlot(slotBookings);
      const bookingStatuses = this.getBookingStatusesForTimeSlot(slotBookings);

      slots.push({
        time: timeString,
        date: new Date(currentTime),
        isAvailable: this.isBayAvailableForTimeSlot(occupiedBays),
        isOperatingHour: true,
        bookings: slotBookings,
        occupiedBays: occupiedBays,
        bookingStatuses: bookingStatuses
      });

      currentTime = new Date(currentTime.getTime() + 30 * 60000);
    }

    return slots;
  }

  getBookingStatusesForTimeSlot(bookings: any[]): string[] {
    return [...new Set(bookings.map(booking => booking.status))];
  }

  getAvailableBaysCountForSlot(day: DaySchedule, time: string): number {
    const slot = this.getSlotForDayAndTime(day, time);
    if (!slot || !slot.occupiedBays) return this.bays.length;
    return this.bays.length - slot.occupiedBays.length;
  }

  getStatusShortDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'Pend',
      'approved': 'Appr',
      'assigned': 'Asgn',
      'in_progress': 'Progress',
      'completed': 'Done',
      'ready_to_collect': 'Ready',
      'invoice_generated': 'Inv Generated',
    };
    return statusMap[status] || status.substring(0, 4);
  }

  getBookingTooltip(booking: any): string {
    const vehicle = booking.vehicle || {};
    const bay = booking.bayId ? this.getBayName(booking.bayId) : 'No Bay';
    const duration = booking.estimatedDuration || 0;
    const status = booking.status || 'unknown';

    return `${vehicle.plateNumber || 'No Plate'} - ${vehicle.make || ''} ${vehicle.model || ''}
    Bay: ${bay}
    Duration: ${duration} minutes
    Status: ${status}
    Time: ${booking.scheduledTime}`;
  }

  getBookingsForTimeSlot(dayBookings: ServiceBooking[], timeString: string): any[] {
    const [slotHour, slotMinute] = timeString.split(':').map(Number);
    const slotStartMinutes = slotHour * 60 + slotMinute;
    const slotEndMinutes = slotStartMinutes + 30; // 30-minute slot

    const overlappingBookings = dayBookings.filter(booking => {
      if (!booking.scheduledTime) return false;

      const [bookingHour, bookingMinute] = booking.scheduledTime.split(':').map(Number);
      const bookingStartMinutes = bookingHour * 60 + bookingMinute;
      const bookingEndMinutes = bookingStartMinutes + (booking.estimatedDuration || 60);

      // Check if the time slot overlaps with the booking duration
      const overlaps = slotStartMinutes < bookingEndMinutes && slotEndMinutes > bookingStartMinutes;    
      return overlaps;
    });
    return overlappingBookings;
  }

  debugTimeSlotBookings() {
    this.schedule.forEach(day => {

      day.timeSlots.forEach(slot => {
        if (slot.bookings && slot.bookings.length > 0) {
          slot.bookings.forEach((booking, index) => {
          });
        }
      });
    });
  }

  getOccupiedBaysForTimeSlot(bookings: any[]): string[] {
    const occupiedBays: string[] = [];

    bookings.forEach(booking => {
      if (booking.bayId && !occupiedBays.includes(booking.bayId)) {
        occupiedBays.push(booking.bayId);
      }
    });

    return occupiedBays;
  }

  generateEmptySlotsForDay(date: Date): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // for closed days only generate slots during the overall operating hours
    let currentTime = new Date(date);
    const [startHour, startMinute] = this.overallStartTime.split(':').map(Number);
    currentTime.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(date);
    const [endHour, endMinute] = this.overallEndTime.split(':').map(Number);
    endTime.setHours(endHour, endMinute, 0, 0);

    while (currentTime < endTime) {
      slots.push({
        time: currentTime.toTimeString().slice(0, 5),
        date: new Date(currentTime),
        isAvailable: false,
        isOperatingHour: false
      });

      currentTime = new Date(currentTime.getTime() + 30 * 60000);
    }

    return slots;
  }


  // get unique time slots only within the overall operating hours
  getUniqueTimeSlots(): string[] {
    const allTimeSlots = this.schedule.flatMap(day =>
      day.timeSlots.map(slot => slot.time)
    );

    // Filter to only include slots within overall operating hours
    const filteredSlots = allTimeSlots.filter(time => {
      return time >= this.overallStartTime && time <= this.overallEndTime;
    });

    return [...new Set(filteredSlots)].sort();
  }

  getSlotForDayAndTime(day: DaySchedule, time: string): TimeSlot | undefined {
    return day.timeSlots.find(slot => slot.time === time);
  }

  getBayName(bayId: string | undefined): string {
    if (!bayId) return 'Unknown Bay';
    const bay = this.bays.find(b => b.id === bayId);
    return bay ? bay.name : 'Unknown Bay';
  }

  getVehicleShortDisplay(booking: any): string {
    if (!booking.vehicle) return 'Unknown Vehicle';

    const plate = booking.vehicle.plateNumber || '';
    const make = booking.vehicle.make || '';
    const model = booking.vehicle.model || '';

    if (plate) {
      return `${plate} - ${make} ${model}`.substring(0, 15) + '...';
    } else if (make && model) {
      return `${make} ${model}`.substring(0, 12) + '...';
    }

    return 'Vehicle';
  }

  previousPeriod() {
    const currentStart = this.currentStartDate.value;
    const range = this.selectedDateRange.value;

    let newStart: Date;

    switch (range) {
      case 'week':
        newStart = new Date(currentStart);
        newStart.setDate(currentStart.getDate() - 7);
        break;
      case 'month':
        newStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, 1);
        break;
      case 'year':
        newStart = new Date(currentStart.getFullYear() - 1, 0, 1);
        break;
    }

    this.currentStartDate.next(newStart);
  }

  nextPeriod() {
    const currentStart = this.currentStartDate.value;
    const range = this.selectedDateRange.value;

    let newStart: Date;

    switch (range) {
      case 'week':
        newStart = new Date(currentStart);
        newStart.setDate(currentStart.getDate() + 7);
        break;
      case 'month':
        newStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
        break;
      case 'year':
        newStart = new Date(currentStart.getFullYear() + 1, 0, 1);
        break;
    }

    this.currentStartDate.next(newStart);
  }

  goToToday() {
    this.currentStartDate.next(this.getWeekStart(new Date()));
  }

  setDateRange(range: 'week' | 'month' | 'year') {
    this.selectedDateRange.next(range);

    const today = new Date();
    let newStart: Date;

    switch (range) {
      case 'week':
        newStart = this.getWeekStart(today);
        break;
      case 'month':
        newStart = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'year':
        newStart = new Date(today.getFullYear(), 0, 1);
        break;
    }

    this.currentStartDate.next(newStart);
  }

  onBayFilterChange(bayId: string) {
    this.selectedBay = bayId;
    this.loadTimelineData(this.selectedDateRange.value, this.currentStartDate.value);
  }

  getDateRange(range: 'week' | 'month' | 'year', startDate: Date): Date[] {
    const dates: Date[] = [];

    switch (range) {
      case 'week':
        for (let i = 0; i < 7; i++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + i);
          dates.push(date);
        }
        break;

      case 'month':
        const year = startDate.getFullYear();
        const month = startDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 1; i <= daysInMonth; i++) {
          dates.push(new Date(year, month, i));
        }
        break;

      case 'year':
        const startYear = startDate.getFullYear();
        for (let month = 0; month < 12; month++) {
          dates.push(new Date(startYear, month, 1));
        }
        break;
    }

    return dates;
  }

  getWeekStart(date: Date): Date {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  isPast(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  }
}