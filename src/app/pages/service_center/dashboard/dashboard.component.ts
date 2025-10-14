import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, Timestamp, doc, getDoc, onSnapshot, DocumentData } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
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

  // Real-time unsubscribe functions
  private serviceBookingsUnsubscribe: (() => void) | null = null;
  private towingRequestsUnsubscribe: (() => void) | null = null;
  private todayBookingsUnsubscribe: (() => void) | null = null;

  async ngOnInit() {
    this.serviceCenterId = this.auth.getServiceCenterId();
    if (!this.serviceCenterId) return;

    await this.setupRealTimeListeners();
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
      'pending': 'bg-warning',
      'confirmed': 'bg-info',
      'accepted': 'bg-info',
      'assigned': 'bg-primary',
      'dispatched': 'bg-primary',
      'in_progress': 'bg-orange',
      'ongoing': 'bg-orange',
      'ready_to_collect': 'bg-success',
      'completed': 'bg-success',
      'declined': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }
}