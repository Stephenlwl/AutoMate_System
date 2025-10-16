import { Component, inject, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, getDoc, updateDoc, doc, setDoc, Timestamp, orderBy, limit, startAfter } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth/service-center-auth';
import { Modal } from 'bootstrap';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { onSnapshot } from 'firebase/firestore';

@Component({
  selector: 'app-manage-service-bookings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HttpClientModule],
  templateUrl: './manage-service-bookings.component.html',
  styleUrls: ['./manage-service-bookings.component.css']
})
export class ManageServiceBookingsComponent implements OnInit, OnDestroy {
  @ViewChild('viewDetailsModal') viewDetailsModalElement!: ElementRef;
  @ViewChild('assignModal') assignModalElement!: ElementRef;
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private http = inject(HttpClient);
  private viewDetailsModal: any;
  private assignModal: any;
  private bookingUnsubscribe: any;
  availableBays: any[] = [];
  loadingBays = false;

  private destroy$ = new Subject<void>();

  loadingStates = {
    confirm: new Set<string>(),
    decline: new Set<string>(),
    assign: new Set<string>(),
    inProgress: new Set<string>(),
    ready: new Set<string>(),
    complete: new Set<string>(),
    invoice: new Set<string>(),
    receipt: new Set<string>(),
    payment: new Set<string>(),
    refresh: false,
    loadMore: false
  };

  // Stats
  stats = [
    { label: 'Pending', count: 0, textClass: 'text-warning', bgClass: 'bg-warning-subtle', icon: 'bi-clock' },
    { label: 'In Progress', count: 0, textClass: 'text-info', bgClass: 'bg-info-subtle', icon: 'bi-gear' },
    { label: 'Ready to Collect', count: 0, textClass: 'text-primary', bgClass: 'bg-primary-subtle', icon: 'bi-car-front' },
    { label: 'Completed Today', count: 0, textClass: 'text-success', bgClass: 'bg-success-subtle', icon: 'bi-check-circle' }
  ];

  // Filter and Search
  statusFilter = 'all';
  dateFrom = '';
  dateTo = '';
  searchTerm = '';

  // Bookings Data
  bookings: any[] = [];
  filteredBookings: any[] = [];
  loading = false;
  loadingMore = false;
  hasMoreData = true;
  lastVisible: any = null;

  // Assignment Modal
  selectedBooking: any = null;
  selectedTechnician: string = '';
  selectedBay: string = '';
  assignmentNotes: string = '';
  technicians: any[] = [];
  bays: any[] = [];
  techMap: Record<string, string> = {};
  bayMap: Record<string, string> = {};

  // Invoice Modal
  currentBooking: any = null;
  bookedServices: any[] = [];
  packageServices: any[] = [];
  additionalServices: any[] = [];
  serviceOffers: any[] = [];
  newAdditionalService: any = null;
  currentMileage: number = 0;
  nextMileage: number = 0;
  paymentMethod: string = 'cash';
  paymentStatus: string = 'pending';

  enableTax: boolean = false;
  taxRate: number = 0.06;

  // Receipt Data
  receiptData: any = null;

  // Mileage Tracking
  beforeServiceMileage: number = 0;
  afterServiceMileage: number = 0;

  serviceMaintenances: any[] = [
    {
      serviceType: 'engine_oil',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'alignment',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'battery',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'tire_rotation',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'brake_fluid',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'air_filter',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'coolant',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    }
  ];

  assignForm = this.fb.group({
    technicianId: [''],
    bayId: [''],
    notes: ['']
  });

  async ngOnInit() {
    await this.loadTechniciansAndBays();
    await this.loadServiceOffers();
    await this.loadBookings();
    this.updateStats();
  }

  ngAfterViewInit() {
    this.viewDetailsModal = new Modal(this.viewDetailsModalElement.nativeElement);
    this.assignModal = new Modal(this.assignModalElement.nativeElement);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.bookingUnsubscribe) {
      this.bookingUnsubscribe();
    }
  }

  isLoading(action: string, bookingId?: string): boolean {
    switch (action) {
      case 'confirm':
        return bookingId ? this.loadingStates.confirm.has(bookingId) : false;
      case 'decline':
        return bookingId ? this.loadingStates.decline.has(bookingId) : false;
      case 'assign':
        return bookingId ? this.loadingStates.assign.has(bookingId) : false;
      case 'inProgress':
        return bookingId ? this.loadingStates.inProgress.has(bookingId) : false;
      case 'ready':
        return bookingId ? this.loadingStates.ready.has(bookingId) : false;
      case 'complete':
        return bookingId ? this.loadingStates.complete.has(bookingId) : false;
      case 'invoice':
        return bookingId ? this.loadingStates.invoice.has(bookingId) : false;
      case 'receipt':
        return bookingId ? this.loadingStates.receipt.has(bookingId) : false;
      case 'payment':
        return bookingId ? this.loadingStates.payment.has(bookingId) : false;
      case 'refresh':
        return this.loadingStates.refresh;
      case 'loadMore':
        return this.loadingStates.loadMore;
      default:
        return false;
    }
  }

  setLoading(action: string, bookingId?: string, loading: boolean = true): void {
    switch (action) {
      case 'confirm':
        if (bookingId) {
          loading ? this.loadingStates.confirm.add(bookingId) : this.loadingStates.confirm.delete(bookingId);
        }
        break;
      case 'decline':
        if (bookingId) {
          loading ? this.loadingStates.decline.add(bookingId) : this.loadingStates.decline.delete(bookingId);
        }
        break;
      case 'assign':
        if (bookingId) {
          loading ? this.loadingStates.assign.add(bookingId) : this.loadingStates.assign.delete(bookingId);
        }
        break;
      case 'inProgress':
        if (bookingId) {
          loading ? this.loadingStates.inProgress.add(bookingId) : this.loadingStates.inProgress.delete(bookingId);
        }
        break;
      case 'ready':
        if (bookingId) {
          loading ? this.loadingStates.ready.add(bookingId) : this.loadingStates.ready.delete(bookingId);
        }
        break;
      case 'complete':
        if (bookingId) {
          loading ? this.loadingStates.complete.add(bookingId) : this.loadingStates.complete.delete(bookingId);
        }
        break;
      case 'invoice':
        if (bookingId) {
          loading ? this.loadingStates.invoice.add(bookingId) : this.loadingStates.invoice.delete(bookingId);
        }
        break;
      case 'receipt':
        if (bookingId) {
          loading ? this.loadingStates.receipt.add(bookingId) : this.loadingStates.receipt.delete(bookingId);
        }
        break;
      case 'payment':
        if (bookingId) {
          loading ? this.loadingStates.payment.add(bookingId) : this.loadingStates.payment.delete(bookingId);
        }
        break;
      case 'refresh':
        this.loadingStates.refresh = loading;
        break;
      case 'loadMore':
        this.loadingStates.loadMore = loading;
        break;
    }
  }

  // Load bookings with pagination
  async loadBookings() {
    if (this.loading) return;

    this.loading = true;
    try {
      const scId = await this.auth.getServiceCenterId();
      if (!scId) {
        this.bookings = [];
        this.loading = false;
        return;
      }

      let q = query(
        collection(this.firestore, 'service_bookings'),
        where('serviceCenterId', '==', scId),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      // Use onSnapshot for real-time updates
      const unsubscribe = onSnapshot(q,
        (snapshot) => {
          this.lastVisible = snapshot.docs[snapshot.docs.length - 1];
          this.hasMoreData = snapshot.docs.length === 20;

          const bookingsRaw = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

          // Enrich and update bookings
          this.enrichBookings(bookingsRaw).then(enriched => {
            this.bookings = enriched;
            this.applyFilters();
            this.updateStats();
            this.loading = false;
          });
        },
        (error) => {
          console.error('Error loading bookings:', error);
          this.loading = false;
        }
      );

      // Store unsubscribe function for cleanup
      this.bookingUnsubscribe = unsubscribe;

    } catch (error) {
      console.error('Error setting up bookings listener:', error);
      this.loading = false;
    }
  }

  async loadMoreBookings() {
    if (!this.hasMoreData || this.loadingMore) return;

    this.setLoading('loadMore', undefined, true);
    this.loadingMore = true;

    try {
      const scId = await this.auth.getServiceCenterId();
      if (!scId) return;

      let q = query(
        collection(this.firestore, 'service_bookings'),
        where('serviceCenterId', '==', scId),
        orderBy('createdAt', 'desc'),
        startAfter(this.lastVisible),
        limit(20)
      );

      const sbSnap = await getDocs(q);
      this.lastVisible = sbSnap.docs[sbSnap.docs.length - 1];
      this.hasMoreData = sbSnap.docs.length === 20;

      const bookingsRaw = sbSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const enriched = await this.enrichBookings(bookingsRaw);

      this.bookings = [...this.bookings, ...enriched];
      this.applyFilters();
    } catch (error) {
      console.error('Error loading more bookings:', error);
    }

    this.loadingMore = false;
    this.setLoading('loadMore', undefined, false);
  }

  async enrichBookings(bookingsRaw: any[]): Promise<any[]> {
    const enriched: any[] = [];

    for (const b of bookingsRaw) {
      const booking: any = { ...b };

      // Enrich customer data
      if (booking.userId) {
        try {
          const userRef = doc(this.firestore, 'car_owners', booking.userId);
          const uSnap = await getDoc(userRef);
          if (uSnap.exists()) {
            const userData = uSnap.data();
            booking.customer = {
              id: booking.userId,
              name: userData['name'],
              email: userData['email'],
              phone: userData['phone']
            };

            // Find the specific vehicle in the vehicles array
            if (booking.vehicleId && userData['vehicles']) {
              const vehicle = userData['vehicles'].find((v: any) => v.plateNumber === booking.vehicleId);
              if (vehicle) {
                booking.vehicle = {
                  id: booking.vehicleId,
                  make: vehicle.make,
                  model: vehicle.model,
                  year: vehicle.year,
                  plateNumber: vehicle.plateNumber,
                  vin: vehicle.vin,
                  fuelType: vehicle.fuelType,
                  displacement: vehicle.displacement,
                  sizeClass: vehicle.sizeClass,
                  lastServiceMileage: vehicle.lastServiceMileage || 0,
                  lastServiceDate: vehicle.lastServiceDate || null,
                  mileageUpdatedAt: vehicle.mileageUpdatedAt || null,
                  currentMileage: vehicle.currentMileage || 0,
                  mileageUpdatedBy: vehicle.mileageUpdatedBy || null,
                  serviceMaintenances: vehicle.serviceMaintenances || []
                };
              }
            }
          }
        } catch (err) {
          console.warn('Failed to load customer for', booking.userId, err);
        }
      }

      // Enrich technician data
      if (booking.technicianId) {
        try {
          const tRef = doc(this.firestore, 'staffs', booking.technicianId);
          const tSnap = await getDoc(tRef);
          if (tSnap.exists()) booking.technician = { id: booking.technicianId, ...tSnap.data() };
        } catch (err) { console.warn('Failed to load technician for', booking.technicianId, err); }
      }

      // Enrich bay data
      if (booking.bayId) {
        try {
          const bRef = doc(this.firestore, 'bays', booking.bayId);
          const bSnap = await getDoc(bRef);
          if (bSnap.exists()) booking.bay = { id: booking.bayId, ...bSnap.data() };
        } catch (err) { console.warn('Failed to load bay for', booking.bayId, err); }
      }

      // Load invoice data if exists
      if (booking.invoiceId) {
        try {
          const invoiceRef = doc(this.firestore, 'service_invoice', booking.invoiceId);
          const invoiceSnap = await getDoc(invoiceRef);
          if (invoiceSnap.exists()) {
            booking.invoice = { id: booking.invoiceId, ...invoiceSnap.data() };
          }
        } catch (err) { console.warn('Failed to load invoice for', booking.invoiceId, err); }
      }

      enriched.push(booking);
    }

    return enriched;
  }

  // Filter methods
  applyFilters() {
    let filtered = [...this.bookings];

    // Status filter
    if (this.statusFilter && this.statusFilter !== 'all') {
      filtered = filtered.filter(booking => booking.status === this.statusFilter);
    }

    // Date filter
    if (this.dateFrom) {
      const fromDate = new Date(this.dateFrom);
      filtered = filtered.filter(booking => {
        const bookingDate = booking.scheduledDate?.toDate?.() || new Date(booking.scheduledDate);
        return bookingDate >= fromDate;
      });
    }

    if (this.dateTo) {
      const toDate = new Date(this.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(booking => {
        const bookingDate = booking.scheduledDate?.toDate?.() || new Date(booking.scheduledDate);
        return bookingDate <= toDate;
      });
    }

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(booking =>
        booking.customer?.name?.toLowerCase().includes(term) ||
        booking.vehicle?.make?.toLowerCase().includes(term) ||
        booking.vehicle?.model?.toLowerCase().includes(term) ||
        booking.vehicle?.plateNumber?.toLowerCase().includes(term) ||
        booking.services?.some((s: any) => s.serviceName?.toLowerCase().includes(term))
      );
    }

    this.filteredBookings = filtered;
  }

  onStatusFilterChange() {
    this.applyFilters();
  }

  onDateFilterChange() {
    this.applyFilters();
  }

  onSearch() {
    this.applyFilters();
  }

  setQuickFilter(type: string) {
    const today = new Date();

    switch (type) {
      case 'today':
        this.dateFrom = today.toISOString().split('T')[0];
        this.dateTo = today.toISOString().split('T')[0];
        break;
      case 'tomorrow':
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        this.dateFrom = tomorrow.toISOString().split('T')[0];
        this.dateTo = tomorrow.toISOString().split('T')[0];
        break;
      case 'this_week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        this.dateFrom = startOfWeek.toISOString().split('T')[0];
        this.dateTo = endOfWeek.toISOString().split('T')[0];
        break;
      case 'pending_assign':
        this.statusFilter = 'confirmed';
        this.dateFrom = '';
        this.dateTo = '';
        break;
      case 'ready_to_collect':
        this.statusFilter = 'ready_to_collect';
        this.dateFrom = '';
        this.dateTo = '';
        break;
    }

    this.applyFilters();
  }

  clearFilters() {
    this.statusFilter = 'all';
    this.dateFrom = '';
    this.dateTo = '';
    this.searchTerm = '';
    this.applyFilters();
  }

  // Load technicians and bays for assignment
  async loadTechniciansAndBays() {
    try {
      const scId = await this.auth.getServiceCenterId();
      if (!scId) return;

      // Load technicians
      const st = await getDocs(query(
        collection(this.firestore, 'staffs'),
        where('serviceCenterId', '==', scId),
        where('role', '==', 'technician'),
        where('status', '==', 'approved')
      ));
      this.technicians = st.docs.map(d => ({ id: d.id, ...d.data() }));
      this.techMap = Object.fromEntries(this.technicians.map(t => [t.id, t.name || t.id]));

      // Load bays
      const ba = await getDocs(query(
        collection(this.firestore, 'bays'),
        where('serviceCenterId', '==', scId)
      ));
      this.bays = ba.docs.map(d => ({ id: d.id, ...d.data() }));
      this.bayMap = Object.fromEntries(this.bays.map(b => [b.id, b.name || b.id]));
    } catch (err) {
      console.error('Failed loading techs/bays', err);
    }
  }

  async loadAvailableBaysForBooking(booking: any) {
    this.loadingBays = true;
    this.availableBays = [];

    try {
      await this.loadTechniciansAndBays();
      const availabilityResults = [];
      for (const bay of this.bays) {
        const isAvailable = await this.isBayAvailableForBooking(bay.id, booking);
        availabilityResults.push({
          ...bay,
          isAvailable: isAvailable
        });
      }
      this.availableBays = availabilityResults;
      if (this.selectedBay) {
        const currentBay = this.availableBays.find(b => b.id === this.selectedBay);
        if (!currentBay || !currentBay.isAvailable) {
          const firstAvailable = this.availableBays.find(b => b.isAvailable);
          this.selectedBay = firstAvailable ? firstAvailable.id : '';
        }
      }

    } catch (error) {
      console.error('Error loading available bays:', error);
      this.availableBays = this.bays.map(bay => ({ ...bay, isAvailable: true }));
    } finally {
      this.loadingBays = false;
    }
  }

async isBayAvailableForBooking(bayId: string, booking: any): Promise<boolean> {
  try {
    const scheduledDate = this.getBookingDate(booking);
    const scheduledTime = booking.scheduledTime;
    const duration = booking.estimatedDuration || 60;
    const serviceCenterId = booking.serviceCenterId;

    if (!scheduledDate || !scheduledTime || !serviceCenterId) {
      console.warn('Missing required booking data:', { scheduledDate, scheduledTime, serviceCenterId });
      return true;
    }

    // Parse the scheduled time
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const startDateTime = new Date(scheduledDate);
    startDateTime.setHours(hours, minutes, 0, 0);
    
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
    const queryDate = new Date(scheduledDate);
    
    // Query for bookings on the same day, same bay, with active status
    const overlappingBookingsQuery = query(
      collection(this.firestore, 'service_bookings'),
      where('serviceCenterId', '==', serviceCenterId),
      where('scheduledDate', '==', Timestamp.fromDate(queryDate)),
      where('bayId', '==', bayId),
      where('status', 'in', ['assigned', 'in_progress', 'ready_to_collect', 'invoice_generated', 'approved'])
    );

    const overlappingBookings = await getDocs(overlappingBookingsQuery);

    let overlapFound = false;

    for (const doc of overlappingBookings.docs) {
      const existingBooking = doc.data();
      const existingBookingId = doc.id;

      if (existingBookingId === booking.id) {
        console.log('skipping current booking:', existingBookingId);
        continue;
      }

      const existingTime = existingBooking['scheduledTime'];
      const existingDuration = existingBooking['estimatedDuration'] || 60;

      if (existingTime) {
        const [existingHours, existingMinutes] = existingTime.split(':').map(Number);
        
        // Use the same scheduledDate (not queryDate) for time comparison
        const existingStart = new Date(scheduledDate);
        existingStart.setHours(existingHours, existingMinutes, 0, 0);
        
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60000);

        // Check for time overlap
        if (this.doTimeSlotsOverlap(startDateTime, endDateTime, existingStart, existingEnd)) {
          overlapFound = true;
          break;
        } 
      }
    }
    return !overlapFound;
  } catch (error) {
    console.error('Error in isBayAvailableForBooking:', error);
    return false;
  }
}

  private getBookingDate(booking: any): Date | null {
    try {
      if (booking.scheduledDate?.toDate) {
        return booking.scheduledDate.toDate();
      } else if (booking.scheduledDate instanceof Date) {
        return booking.scheduledDate;
      } else if (booking.scheduledDate?.seconds) {
        return new Date(booking.scheduledDate.seconds * 1000);
      }
      return null;
    } catch (error) {
      console.error('Error parsing booking date:', error);
      return null;
    }
  }

  doTimeSlotsOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 < end2 && end1 > start2;
  }

  async loadServiceOffers() {
    try {
      const scId = await this.auth.getServiceCenterId();
      if (!scId) return;

      const offersSnap = await getDocs(query(
        collection(this.firestore, 'services'),
      ));
      this.serviceOffers = offersSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        quantity: 1,
        unitPrice: d.data()['price'] || 0
      }));
    } catch (err) {
      console.error('Failed loading service offers', err);
    }
  }

  canAssign(booking: any): boolean {
    return booking && (booking.status === 'confirmed' || booking.status === 'assigned');
  }

  canComplete(booking: any): boolean {
    return booking && booking.status === 'in_progress';
  }

  canViewReceipt(booking: any): boolean {
    return booking && booking.invoiceId && booking.status === 'completed';
  }

  async confirm(booking: any) {
    if (this.isLoading('confirm', booking.id)) return;

    if (confirm('Confirm this appointment?')) {
      this.setLoading('confirm', booking.id, true);

      try {
        const updateData: any = {
          status: 'confirmed',
          updatedAt: Timestamp.now(),
          statusUpdatedBy: this.auth.getAdminName?.() || 'system'
        };

        const newStatusHistory = {
          status: 'confirmed',
          timestamp: Timestamp.now(),
          updatedBy: this.auth.getAdminName?.() || 'system',
          notes: 'Request confirmed by service center'
        };

        updateData.statusHistory = [...(booking.statusHistory || []), newStatusHistory];
        updateData.timestamps = {
          ...booking.timestamps,
          confirmedAt: Timestamp.now()
        };

        await updateDoc(doc(this.firestore, 'service_bookings', booking.id), updateData);
        await this.sendStatusUpdateEmail(booking, 'confirmed');
        await this.loadBookings();
      } catch (error) {
        console.error('Error confirming booking:', error);
        alert('Failed to confirm booking. Please try again.');
      } finally {
        this.setLoading('confirm', booking.id, false);
      }
    }
  }

  async decline(booking: any) {
    if (this.isLoading('decline', booking.id)) return;

    if (confirm('Decline this appointment?')) {
      this.setLoading('decline', booking.id, true);

      try {
        const updateData: any = {
          status: 'declined',
          updatedAt: Timestamp.now(),
          statusUpdatedBy: this.auth.getAdminName?.() || 'system'
        };
        const newStatusHistory = {
          status: 'declined',
          timestamp: Timestamp.now(),
          updatedBy: this.auth.getAdminName?.() || 'system',
          notes: 'Request declined by service center'
        };

        updateData.statusHistory = [...(booking.statusHistory || []), newStatusHistory];
        updateData.timestamps = {
          ...booking.timestamps,
          declinedAt: Timestamp.now()
        };
        await updateDoc(doc(this.firestore, 'service_bookings', booking.id), updateData);

        await this.sendStatusUpdateEmail(booking, 'declined');

        await this.loadBookings();
      } catch (error) {
        console.error('Error declining booking:', error);
        alert('Failed to decline booking. Please try again.');
      } finally {
        this.setLoading('decline', booking.id, false);
      }
    }
  }

  async openAssignModal(booking: any) {
    this.viewDetailsModal.hide();
    setTimeout(async () => {
      this.selectedBooking = booking;
      this.selectedTechnician = booking.technicianId || '';
      this.selectedBay = booking.bayId || '';
      this.assignmentNotes = '';
      await this.loadAvailableBaysForBooking(booking);
      this.assignModal.show();
    }, 300);
  }

  async saveAssignment() {
    if (!this.selectedBooking || !this.selectedTechnician || !this.selectedBay) {
      alert('Please select both technician and bay');
      return;
    }

    if (this.isLoading('assign', this.selectedBooking.id)) return;

    this.setLoading('assign', this.selectedBooking.id, true);

    try {
      const updateData: any = {
        technicianId: this.selectedTechnician,
        bayId: this.selectedBay,
        status: 'assigned',
        updatedAt: Timestamp.now(),
        statusUpdatedBy: this.auth.getAdminName?.() || 'system'
      };

      const newStatusHistory = {
        status: 'assigned',
        timestamp: Timestamp.now(),
        updatedBy: this.auth.getAdminName?.() || 'system',
        notes: `Assigned to technician ${this.techMap[this.selectedTechnician]} in bay ${this.bayMap[this.selectedBay]}`
      };

      updateData.statusHistory = [...(this.selectedBooking.statusHistory || []), newStatusHistory];

      updateData.timestamps = {
        ...this.selectedBooking.timestamps,
        assignedAt: Timestamp.now()
      };

      await updateDoc(doc(this.firestore, 'service_bookings', this.selectedBooking.id), updateData);
      await this.sendStatusUpdateEmail(this.selectedBooking, 'assigned');

      this.assignModal.hide();
      this.selectedBooking = null;
      await this.loadBookings();
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('Failed to save assignment. Please try again.');
    } finally {
      this.setLoading('assign', this.selectedBooking?.id, false);
    }
  }

  async markInProgress(booking: any) {
    if (this.isLoading('inProgress', booking.id)) return;

    this.setLoading('inProgress', booking.id, true);

    try {
      const updateData: any = {
        status: 'in_progress',
        updatedAt: Timestamp.now(),
        statusUpdatedBy: this.auth.getAdminName?.() || 'system'
      };

      const newStatusHistory = {
        status: 'in_progress',
        timestamp: Timestamp.now(),
        updatedBy: this.auth.getAdminName?.() || 'system',
        notes: 'Service work started'
      };

      updateData.statusHistory = [...(booking.statusHistory || []), newStatusHistory];

      updateData.timestamps = {
        ...booking.timestamps,
        inProgressAt: Timestamp.now()
      };

      await updateDoc(doc(this.firestore, 'service_bookings', booking.id), updateData);
      await this.sendStatusUpdateEmail(booking, 'in_progress');
      await this.loadBookings();
    } catch (error) {
      console.error('Error marking in progress:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      this.setLoading('inProgress', booking.id, false);
    }
  }

  async markReadyForCollection(booking: any) {
    if (this.isLoading('ready', booking.id)) return;

    this.setLoading('ready', booking.id, true);

    try {
      const updateData: any = {
        status: 'ready_to_collect',
        updatedAt: Timestamp.now(),
        statusUpdatedBy: this.auth.getAdminName?.() || 'system'
      };

      const newStatusHistory = {
        status: 'ready_to_collect',
        timestamp: Timestamp.now(),
        updatedBy: this.auth.getAdminName?.() || 'system',
        notes: 'Service completed - ready for collection'
      };

      updateData.statusHistory = [...(booking.statusHistory || []), newStatusHistory];

      updateData.timestamps = {
        ...booking.timestamps,
        readyAt: Timestamp.now()
      };

      await updateDoc(doc(this.firestore, 'service_bookings', booking.id), updateData);
      await this.sendStatusUpdateEmail(booking, 'ready_to_collect');
      await this.loadBookings();
    } catch (error) {
      console.error('Error marking ready for collection:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      this.setLoading('ready', booking.id, false);
    }
  }

  private async sendStatusUpdateEmail(booking: any, status: string) {
    try {
      const customerEmail = booking.customer?.email || booking.userEmail;

      if (!customerEmail) {
        console.warn('No customer email found for booking:', booking.id);
        return;
      }

      const emailData = {
        toEmail: customerEmail,
        customerName: booking.customer?.name || 'Customer',
        bookingId: booking.id,
        status: status,
        scheduledDate: this.formatDateForEmail(booking.scheduledDate),
        scheduledTime: booking.scheduledTime || 'N/A',
        vehicleInfo: this.getVehicleInfo(booking),
        serviceCenterName: this.auth.getServiceCenterName?.() || 'AutoMate Service Center',
        technicianName: booking.technician?.name || '',
        bayNumber: booking.bay?.name || '',
      };

      const data = await firstValueFrom(
        this.http.post<any>('http://localhost:3000/serviceStatusUpdate/service-booking-status', emailData)
      );

      console.log('Email notification sent successfully:', data);

    } catch (error) {
      console.error('Failed to send email notification:', error);
    }
  }

  private formatDateForEmail(timestamp: any): string {
    if (!timestamp) return 'N/A';

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'N/A';
    }
  }

  private getVehicleInfo(booking: any): string {
    if (booking.vehicle) {
      const vehicle = booking.vehicle;
      return `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.plateNumber ? `(${vehicle.plateNumber})` : ''}`.trim();
    }
    return 'Vehicle information not available';
  }

  openInvoice(booking: any) {
    if (this.isLoading('invoice', booking.id)) return;

    this.setLoading('invoice', booking.id, true);

    try {
      if (booking.invoiceId) {
        const url = `/service-invoice/${booking.invoiceId}/${this.auth.getAdminName?.() || 'system'}`;
        window.open(url, '_blank');
      } else {
        if (booking.status === 'in_progress') {
          const url = `/service-invoice/booking/${booking.id}/${this.auth.getAdminName?.() || 'system'}`;
          window.open(url, '_blank');
        } else {
          alert('Cannot generate invoice. Booking must be in "in progress" status.');
        }
      }
    } catch (error) {
      console.error('Error opening invoice:', error);
      alert('Failed to open invoice. Please try again.');
    } finally {
      this.setLoading('invoice', booking.id, false);
    }
  }

  initializeServiceMaintenance(booking: any) {
    const vehicleMaintenance = booking.vehicle?.serviceMaintenances || [];

    this.serviceMaintenances = this.serviceMaintenances.map(maintenance => {
      const existing = vehicleMaintenance.find((m: any) => m.serviceType === maintenance.serviceType);

      if (existing) {
        return {
          ...maintenance,
          lastServiceMileage: existing.lastServiceMileage || 0,
          nextServiceMileage: existing.nextServiceMileage || this.calculateNextMileage(this.beforeServiceMileage),
          nextServiceDate: existing.nextServiceDate,
          updated: false
        };
      } else {
        return {
          ...maintenance,
          lastServiceMileage: this.beforeServiceMileage,
          nextServiceMileage: this.calculateNextMileage(this.beforeServiceMileage),
          nextServiceDate: this.calculateNextServiceDate(6),
          updated: false
        };
      }
    });
  }

  formatDateForInput(dateValue: any): string {
    if (!dateValue) return '';

    try {
      // Handle Firestore Timestamp
      if (dateValue.toDate) {
        return dateValue.toDate().toISOString().split('T')[0];
      }
      // Handle string date
      else if (typeof dateValue === 'string') {
        return dateValue.split('T')[0];
      }
      // Handle Date object
      else if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0];
      }
      return '';
    } catch (error) {
      console.warn('Error formatting date:', error);
      return '';
    }
  }

  calculateNextServiceDate(months: number = 6): string {
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + months);
    return nextDate.toISOString().split('T')[0];
  }

  updatePackageTotal(pkg: any) {
    pkg.totalPrice = pkg.fixedPrice || 0;
  }

  calculateSubtotal(): number {
    const bookedServicesTotal = this.bookedServices.reduce((total, service) => {
      const serviceTotal = (service.totalPrice || 0);
      return total + serviceTotal;
    }, 0);

    const packagesTotal = this.packageServices.reduce((total, pkg) => {
      const pkgTotal = (pkg.totalPrice || pkg.fixedPrice || 0);
      return total + pkgTotal;
    }, 0);

    const additionalServicesTotal = this.additionalServices.reduce((total, service) => {
      const serviceTotal = this.calculateAdditionalServiceTotal(service);
      return total + serviceTotal;
    }, 0);

    return bookedServicesTotal + packagesTotal + additionalServicesTotal;
  }

  calculateTaxAmount(): number {
    if (!this.enableTax) return 0;
    return this.calculateSubtotal() * this.taxRate;
  }

  calculateTotal(): number {
    return this.calculateSubtotal() + this.calculateTaxAmount();
  }

  bookedServicesTotal(): number {
    return this.bookedServices.reduce((total, service) => total + (service.totalPrice || 0), 0);
  }

  packagesTotal(): number {
    return this.packageServices.reduce((total, pkg) => total + (pkg.totalPrice || 0), 0);
  }

  additionalServicesTotal(): number {
    return this.additionalServices.reduce((total, service) =>
      total + this.calculateAdditionalServiceTotal(service), 0);
  }

  // Parts management for services
  addPartToService(service: any) {
    if (!service.parts) {
      service.parts = [];
    }
    service.parts.push({
      name: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0
    });
  }

  removePartFromService(service: any, partIndex: number) {
    service.parts.splice(partIndex, 1);
    this.updateServiceTotal(service);
  }

  updatePartTotal(part: any) {
    part.totalPrice = (part.quantity || 1) * (part.unitPrice || 0);
  }

  updateServiceTotal(service: any) {
    const partsTotal = this.calculateServicePartsTotal(service);
    service.totalPrice = (service.labourPrice || 0) + partsTotal;
  }

  calculateServicePartsTotal(service: any): number {
    if (!service.parts || service.parts.length === 0) return 0;
    return service.parts.reduce((total: number, part: any) => {
      const partTotal = (part.quantity || 1) * (part.unitPrice || 0);
      part.totalPrice = partTotal;
      return total + partTotal;
    }, 0);
  }

  // Booked Services Totals
  getBookedServicesLabourTotal(): number {
    if (!this.selectedBooking?.invoice?.bookedServices) return 0;
    return this.selectedBooking.invoice.bookedServices.reduce((sum: number, s: any) => sum + (s.labourPrice || 0), 0);
  }

  getBookedServicesPartsTotal(): number {
    if (!this.selectedBooking?.invoice?.bookedServices) return 0;
    return this.selectedBooking.invoice.bookedServices.reduce((sum: number, s: any) => sum + (s.partsTotal || 0), 0);
  }

  getBookedServicesSubtotal(): number {
    return this.getBookedServicesLabourTotal() + this.getBookedServicesPartsTotal();
  }

  getBookedServicesTotal(): number {
    if (!this.selectedBooking?.invoice?.bookedServices) return 0;
    return this.selectedBooking.invoice.bookedServices.reduce((sum: number, s: any) => sum + (s.totalPrice || 0), 0);
  }

  // Package Services Totals
  getPackageServicesLabourTotal(): number {
    if (!this.selectedBooking?.invoice?.packageServices) return 0;
    return this.selectedBooking.invoice.packageServices.reduce((sum: number, p: any) => sum + (p.labourPrice || 0), 0);
  }

  getPackageServicesPartsTotal(): number {
    if (!this.selectedBooking?.invoice?.packageServices) return 0;
    return this.selectedBooking.invoice.packageServices.reduce((sum: number, p: any) => sum + (p.partPrice || 0), 0);
  }

  getPackageServicesSubtotal(): number {
    return this.getPackageServicesLabourTotal() + this.getPackageServicesPartsTotal();
  }

  getPackageServicesTotal(): number {
    if (!this.selectedBooking?.invoice?.packageServices) return 0;
    return this.selectedBooking.invoice.packageServices.reduce((sum: number, p: any) => sum + (p.totalPrice || 0), 0);
  }

  // Additional Services Totals
  getAdditionalServicesQuantityTotal(): number {
    if (!this.selectedBooking?.invoice?.additionalServices) return 0;
    return this.selectedBooking.invoice.additionalServices.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0);
  }

  getAdditionalServicesLabourTotal(): number {
    if (!this.selectedBooking?.invoice?.additionalServices) return 0;
    return this.selectedBooking.invoice.additionalServices.reduce((sum: number, s: any) => sum + (s.labourPrice || 0), 0);
  }

  getAdditionalServicesTotal(): number {
    if (!this.selectedBooking?.invoice?.additionalServices) return 0;
    return this.selectedBooking.invoice.additionalServices.reduce((sum: number, s: any) => sum + (s.totalPrice || 0), 0);
  }

  // Standalone Parts Totals
  getStandalonePartsQuantityTotal(): number {
    if (!this.selectedBooking?.invoice?.standaloneParts) return 0;
    return this.selectedBooking.invoice.standaloneParts.reduce((sum: number, p: any) => sum + (p.quantity || 1), 0);
  }

  getStandalonePartsTotal(): number {
    if (!this.selectedBooking?.invoice?.standaloneParts) return 0;
    return this.selectedBooking.invoice.standaloneParts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  }

  // Parts Management for Additional Services
  addPartToAdditionalService(service: any) {
    if (!service.parts) {
      service.parts = [];
    }

    service.parts.push({
      name: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0
    });
  }

  removePartFromAdditionalService(service: any, partIndex: number) {
    service.parts.splice(partIndex, 1);
  }

  updateAdditionalServicePartTotal(part: any) {
    part.totalPrice = part.quantity * part.unitPrice;
  }

  calculateAdditionalServicePartsTotal(service: any): number {
    if (!service.parts || service.parts.length === 0) return 0;
    return service.parts.reduce((total: number, part: any) => {
      const partTotal = (part.quantity || 1) * (part.unitPrice || 0);
      part.totalPrice = partTotal;
      return total + partTotal;
    }, 0);
  }

  calculateAdditionalServiceTotal(service: any): number {
    const partsTotal = this.calculateAdditionalServicePartsTotal(service);
    const servicePrice = (service.price || service.unitPrice || 0) * (service.quantity || 1);
    return servicePrice + partsTotal;
  }

  removeBookedService(index: number) {
    this.bookedServices.splice(index, 1);
  }

  removePackageService(index: number) {
    this.packageServices.splice(index, 1);
  }

  // Additional services with quantity support
  addAdditionalService() {
    if (this.newAdditionalService) {
      const additionalService = {
        ...this.newAdditionalService,
        quantity: 1,
        unitPrice: this.newAdditionalService.price || 0,
        totalPrice: this.newAdditionalService.price || 0
      };
      this.additionalServices.push(additionalService);
      this.newAdditionalService = null;
    }
  }

  updateAdditionalServiceTotal(service: any) {
    service.totalPrice = (service.quantity || 0) * (service.unitPrice || 0);
  }

  removeAdditionalService(index: number) {
    this.additionalServices.splice(index, 1);
  }

  isEstimatedPrice(): boolean {
    // Check if any service has range pricing or if it's a new invoice
    const hasRangePricing = this.bookedServices.some(service =>
      service.labourPriceMin !== service.labourPriceMax ||
      service.partPriceMin !== service.partPriceMax
    );

    const hasPackageRangePricing = this.packageServices.some(pkg => pkg.rangePrice);

    return hasRangePricing || hasPackageRangePricing || !this.currentBooking?.invoice;
  }

  getLabourPriceDisplay(service: any): string {
    if (service.labourPriceMin > 0 && service.labourPriceMax > 0) {
      return `${this.formatCurrency(service.labourPriceMin)} - ${this.formatCurrency(service.labourPriceMax)}`;
    }
    return this.formatCurrency(service.labourPrice || service.labourPriceMin || 0);
  }

  getPartPriceDisplay(service: any): string {
    if (service.partPriceMin > 0 && service.partPriceMax > 0) {
      return `${this.formatCurrency(service.partPriceMin)} - ${this.formatCurrency(service.partPriceMax)}`;
    }
    return this.formatCurrency(service.partPrice || service.partPriceMin || 0);
  }

  getTotalPriceDisplay(service: any): string {
    const hasLabourRange = service.labourPriceMin > 0 && service.labourPriceMax > 0;
    const hasPartRange = service.partPriceMin > 0 && service.partPriceMax > 0;

    if (hasLabourRange || hasPartRange) {
      const minTotal = (service.labourPriceMin || service.labourPrice || 0) + (service.partPriceMin || service.partPrice || 0);
      const maxTotal = (service.labourPriceMax || service.labourPrice || 0) + (service.partPriceMax || service.partPrice || 0);
      return `${this.formatCurrency(minTotal)} - ${this.formatCurrency(maxTotal)}`;
    }

    const labourPrice = service.labourPrice || service.labourPriceMin || 0;
    const partPrice = service.partPrice || service.partPriceMin || 0;
    return this.formatCurrency(labourPrice + partPrice);
  }

  hasRangePricing(booking: any): boolean {
    // Check if any service has range pricing
    return booking.services?.some((service: any) =>
      service.labourPriceMin !== service.labourPriceMax ||
      service.partPriceMin !== service.partPriceMax
    ) || booking.packages?.some((pkg: any) => pkg.rangePrice);
  }

  async viewReceipt(booking: any) {
    if (this.isLoading('receipt', booking.id)) return;

    this.setLoading('receipt', booking.id, true);

    try {
      let receiptData: any = null;
      let mode = 'view-receipt';

      // Check if payment has been made
      const isPaid = booking.payment?.status === 'paid' || booking.status === 'completed';

      if (!isPaid && booking.invoiceId) {
        // If not paid, redirect to payment page
        mode = 'payment';

        // Load invoice to get total amount for display
        const invoiceRef = doc(this.firestore, 'service_invoice', booking.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);

        if (invoiceSnap.exists()) {
          const invoiceData: any = { id: invoiceSnap.id, ...invoiceSnap.data() };
          receiptData = {
            receiptId: 'TEMP-REC-' + booking.invoiceId,
            invoiceId: booking.invoiceId,
            serviceBookingId: booking.id,
            serviceCenterId: booking.serviceCenterId,
            customerInfo: invoiceData.customerInfo || booking.customer,
            vehicleInfo: invoiceData.vehicleInfo || booking.vehicle,
            totalAmount: invoiceData.totalAmount || 0,
            type: 'temp_receipt'
          };
        }
      } else if (booking.receiptId) {
        // Load existing receipt
        const receiptRef = doc(this.firestore, 'service_receipts', booking.receiptId);
        const receiptSnap = await getDoc(receiptRef);
        if (receiptSnap.exists()) {
          receiptData = { id: receiptSnap.id, ...receiptSnap.data() };
          mode = 'view-receipt';
        }
      } else if (booking.invoiceId) {
        const receiptsSnap = await getDocs(query(
          collection(this.firestore, 'service_receipts'),
          where('invoiceId', '==', booking.invoiceId),
          limit(1)
        ));

        if (!receiptsSnap.empty) {
          receiptData = { id: receiptsSnap.docs[0].id, ...receiptsSnap.docs[0].data() };
          mode = 'view-receipt';
        } else {
          // Create temporary receipt data from invoice for viewing
          const invoiceRef = doc(this.firestore, 'service_invoice', booking.invoiceId);
          const invoiceSnap = await getDoc(invoiceRef);

          if (invoiceSnap.exists()) {
            const invoiceData: any = { id: invoiceSnap.id, ...invoiceSnap.data() };

            receiptData = {
              receiptId: 'TEMP-REC-' + booking.invoiceId,
              invoiceId: booking.invoiceId,
              serviceBookingId: booking.id,
              serviceCenterId: booking.serviceCenterId,
              customerInfo: invoiceData.customerInfo || booking.customer,
              vehicleInfo: invoiceData.vehicleInfo || booking.vehicle,
              bookedServices: invoiceData.bookedServices || [],
              packageServices: invoiceData.packageServices || [],
              additionalServices: invoiceData.additionalServices || [],
              standaloneParts: invoiceData.standaloneParts || [],
              labourSubtotal: invoiceData.labourSubtotal || 0,
              partsSubtotal: invoiceData.partsSubtotal || 0,
              subtotal: invoiceData.subtotal || 0,
              taxAmount: invoiceData.taxAmount || 0,
              totalAmount: invoiceData.totalAmount || 0,
              amountPaid: invoiceData.payment?.amountPaid || 0,
              payment: invoiceData.payment || booking.payment,
              issuedAt: invoiceData.createdAt || Timestamp.now(),
              issuedBy: invoiceData.createdBy || 'system',
              type: 'temp_receipt'
            };

            // Determine mode based on payment status
            mode = invoiceData.payment?.status === 'paid' ? 'view-receipt' : 'payment';
          }
        }
      }

      if (receiptData) {
        // Open service-payment page in new tab
        const url = this.router.createUrlTree(['/service-payment', booking.id, this.auth.getAdminName?.()], {
          queryParams: {
            mode: mode,
            receiptId: receiptData.receiptId || receiptData.id
          }
        }).toString();

        // Store receipt data in sessionStorage to pass to new tab
        const receiptKey = `receipt_${booking.id}`;
        sessionStorage.setItem(receiptKey, JSON.stringify({
          receiptData: receiptData,
          booking: booking
        }));

        window.open(url, '_blank');
      } else {
        // If no receipt data found, check if we can redirect to payment
        if (booking.invoiceId) {
          // Redirect to payment page
          const url = this.router.createUrlTree(['/service-payment', booking.id, this.auth.getAdminName?.()], {
            queryParams: { mode: 'payment' }
          }).toString();

          // Store basic booking data
          const receiptKey = `receipt_${booking.id}`;
          sessionStorage.setItem(receiptKey, JSON.stringify({
            booking: booking
          }));

          window.open(url, '_blank');
        } else {
          alert('No invoice found for this booking. Please generate an invoice first.');
        }
      }

    } catch (error) {
      console.error('Error loading receipt:', error);
      alert('Failed to load receipt. Please try again.');
    } finally {
      this.setLoading('receipt', booking.id, false);
    }
  }

  async makePayment(booking: any) {
    if (this.isLoading('payment', booking.id)) return;

    this.setLoading('payment', booking.id, true);

    try {
      if (!booking.invoiceId) {
        alert('Cannot process payment. No invoice found for this booking. Please generate an invoice first.');
        return;
      }

      // Redirect to payment page
      const url = this.router.createUrlTree(['/service-payment', booking.id, this.auth.getAdminName?.()], {
        queryParams: { mode: 'payment' }
      }).toString();

      // Store booking data in sessionStorage
      const receiptKey = `receipt_${booking.id}`;
      sessionStorage.setItem(receiptKey, JSON.stringify({
        booking: booking
      }));

      window.open(url, '_blank');

    } catch (error) {
      console.error('Error redirecting to payment:', error);
      alert('Failed to open payment page. Please try again.');
    } finally {
      this.setLoading('payment', booking.id, false);
    }
  }

  async updateVehicleInCarOwner(userId: string, vehicleId: string, currentMileage: number, updatedBy: string | null, updatedMaintenances: any[]) {
    try {
      const carOwnerRef = doc(this.firestore, 'car_owners', userId);
      const carOwnerSnap = await getDoc(carOwnerRef);

      if (!carOwnerSnap.exists()) {
        console.warn('Car owner document not found:', userId);
        return;
      }

      const carOwnerData = carOwnerSnap.data();
      const vehicles = carOwnerData['vehicles'] || [];

      // Find the specific vehicle in the vehicles array
      const vehicleIndex = vehicles.findIndex((v: any) => v['plateNumber'] === vehicleId);

      if (vehicleIndex === -1) {
        console.warn('Vehicle not found in car_owner vehicles array:', vehicleId);
        return;
      }

      // Get existing serviceMaintenances or initialize empty array
      const existingServiceMaintenances = Array.isArray(vehicles[vehicleIndex]['serviceMaintenances'])
        ? [...vehicles[vehicleIndex]['serviceMaintenances']]
        : [];

      // Merge existing serviceMaintenances with updated ones
      const mergedServiceMaintenances = this.mergeServiceMaintenances(
        existingServiceMaintenances,
        updatedMaintenances
      );

      // Update the vehicle data
      const updatedVehicle = {
        ...vehicles[vehicleIndex],
        lastServiceDate: Timestamp.now(),
        mileageUpdatedBy: updatedBy || null,
        lastServiceMileage: currentMileage,
        mileageUpdatedAt: Timestamp.now(),
        serviceMaintenances: mergedServiceMaintenances
      };

      // Update the vehicles array
      const updatedVehicles = [...vehicles];
      updatedVehicles[vehicleIndex] = updatedVehicle;

      // Update the car_owner document
      await updateDoc(carOwnerRef, {
        vehicles: updatedVehicles
      });

      console.log('Vehicle updated successfully in car_owner document');
    } catch (error) {
      console.error('Error updating vehicle in car_owner:', error);
      throw error;
    }
  }

  private mergeServiceMaintenances(existing: any[], updated: any[]): any[] {
    const result = [...existing];

    updated.forEach(updatedItem => {
      const existingIndex = result.findIndex(item => item['serviceType'] === updatedItem['serviceType']);

      if (existingIndex !== -1) {
        // Update existing service maintenance
        result[existingIndex] = {
          ...result[existingIndex],
          lastServiceMileage: updatedItem['lastServiceMileage'],
          mileageUpdatedAt: updatedItem['mileageUpdatedAt'],
          updatedBy: updatedItem['updatedBy'],
          nextServiceMileage: updatedItem['nextServiceMileage'],
          nextServiceDate: updatedItem['nextServiceDate']
        };
      } else {
        // Add new service maintenance
        result.push(updatedItem);
      }
    });

    return result;
  }

  viewDetails(booking: any) {
    this.selectedBooking = booking;
    this.viewDetailsModal.show();
  }

  getStatusBadgeClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'bg-warning text-dark',
      'confirmed': 'bg-info text-white',
      'assigned': 'bg-success text-white',
      'in_progress': 'bg-primary text-white',
      'ready_to_collect': 'bg-info text-white',
      'completed': 'bg-success text-white',
      'declined': 'bg-danger text-white',
      'cancelled': 'bg-secondary text-white'
    };
    return `badge ${classes[status] || 'bg-secondary'}`;
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'pending': 'bi-clock',
      'confirmed': 'bi-check-circle',
      'assigned': 'bi-person-check',
      'in_progress': 'bi-gear',
      'ready_to_collect': 'bi-car-front',
      'completed': 'bi-check-lg',
      'declined': 'bi-x-circle',
      'cancelled': 'bi-x-octagon'
    };
    return icons[status] || 'bi-question-circle';
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'assigned': 'Assigned',
      'in_progress': 'In Progress',
      'ready_to_collect': 'Ready to Collect',
      'completed': 'Completed',
      'declined': 'Declined',
      'cancelled': 'Cancelled'
    };
    return texts[status] || status;
  }

  getUrgencyIcon(urgency: string): string {
    const icons: { [key: string]: string } = {
      'normal': 'bi-arrow-down-circle',
      'urgent': 'bi-exclamation-triangle'
    };
    return icons[urgency] || 'bi-question-circle';
  }

  getUrgencyBadgeClass(urgency: string): string {
    const classes: { [key: string]: string } = {
      'normal': 'bg-success',
      'urgent': 'bg-danger'
    };
    return `badge ${classes[urgency] || 'bg-secondary'}`;
  }

  getMaintenanceIcon(serviceType: string): string {
    const icons: { [key: string]: string } = {
      'engine_oil': 'bi-droplet',
      'alignment': 'bi-geo-alt',
      'battery': 'bi-battery-half',
      'tire_rotation': 'bi-circle',
      'brake_fluid': 'bi-brake',
      'air_filter': 'bi-wind',
      'coolant': 'bi-thermometer-snow'
    };
    return icons[serviceType] || 'bi-gear';
  }

  isUrgent(booking: any): boolean {
    return booking.urgencyLevel === 'urgent';
  }

  isToday(date: any): boolean {
    if (!date) return false;
    const bookingDate = date.toDate ? date.toDate() : new Date(date);
    const today = new Date();
    return bookingDate.toDateString() === today.toDateString();
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date);
    return jsDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDateTime(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date);
    return jsDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    if (!amount) return 'RM0.00';
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount);
  }

  calculateNextMileage(currentMileage: number): number {
    return currentMileage + 5000; // Default 5000 km interval
  }

  trackByBookingId(index: number, booking: any): string {
    return booking.id;
  }

  async refreshData(): Promise<void> {
    if (this.isLoading('refresh')) return;

    this.setLoading('refresh', undefined, true);

    try {
      // Clear current data
      this.bookings = [];
      this.filteredBookings = [];

      // Force reload by unsubscribing and resubscribing
      if (this.bookingUnsubscribe) {
        this.bookingUnsubscribe();
      }

      await this.loadBookings();
      await this.loadTechniciansAndBays();
      await this.loadServiceOffers();

    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      this.setLoading('refresh', undefined, false);
    }
  }

  updateStats(): void {
    const today = new Date().toDateString();

    this.stats[0].count = this.bookings.filter(b => b.status === 'pending').length;
    this.stats[1].count = this.bookings.filter(b => b.status === 'in_progress').length;
    this.stats[2].count = this.bookings.filter(b => b.status === 'ready_to_collect').length;
    this.stats[3].count = this.bookings.filter(b =>
      b.status === 'completed' &&
      b.updatedAt?.toDate?.().toDateString() === today
    ).length;
  }
}