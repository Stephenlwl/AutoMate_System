import { Component, inject, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, getDocs, getDoc, updateDoc, doc, Timestamp, orderBy, limit, startAfter } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { Modal } from 'bootstrap';
import { Subject, firstValueFrom } from 'rxjs';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { onSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';

@Component({
  selector: 'app-manage-towing-bookings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HttpClientModule],
  templateUrl: './manage-towing-bookings.component.html',
  styleUrls: ['./manage-towing-bookings.component.css']
})
export class ManageTowingBookingsComponent implements OnInit, OnDestroy {
  @ViewChild('viewDetailsModal') viewDetailsModalElement!: ElementRef;
  @ViewChild('assignModal') assignModalElement!: ElementRef;
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private viewDetailsModal: any;
  private assignModal: any;

  serviceCenterId: string = '';
  // Destroy subject for subscription cleanup
  private destroy$ = new Subject<void>();
  private towingRequestsUnsubscribe: (() => void) | null = null;
  private isTowingRequestsListenerActive = false;
  // Loading states for each action
  loadingStates = {
    accept: new Set<string>(),
    decline: new Set<string>(),
    assign: new Set<string>(),
    complete: new Set<string>(),
    refresh: false,
    loadMore: false
  };

  // Stats
  stats = [
    { label: 'Pending', count: 0, textClass: 'text-warning', bgClass: 'bg-warning-subtle', icon: 'bi-clock' },
    { label: 'Accepted', count: 0, textClass: 'text-info', bgClass: 'bg-info-subtle', icon: 'bi-check-circle' },
    { label: 'Dispatched', count: 0, textClass: 'text-primary', bgClass: 'bg-primary-subtle', icon: 'bi-person-check' },
    { label: 'Ongoing', count: 0, textClass: 'text-orange', bgClass: 'bg-orange-subtle', icon: 'bi-geo-alt' },
    { label: 'Completed', count: 0, textClass: 'text-success', bgClass: 'bg-success-subtle', icon: 'bi-check-lg' }
  ];

  // Filter and Search
  statusFilter = 'all';
  dateFrom = '';
  dateTo = '';
  searchTerm = '';

  // Towing Requests Data
  towingRequests: any[] = [];
  filteredRequests: any[] = [];
  loading = false;
  loadingMore = false;
  hasMoreData = true;
  lastVisible: any = null;

  // Assignment Modal
  selectedRequest: any = null;
  selectedDriver: string = '';
  assignmentNotes: string = '';
  drivers: any[] = [];
  driverMap: Record<string, string> = {};

  constructor() { }

  async ngOnInit() {
    this.serviceCenterId = await this.auth.getServiceCenterId();
    await this.loadDrivers();
    await this.loadTowingRequests();
    this.updateStats();
  }

  ngAfterViewInit() {
    this.viewDetailsModal = new Modal(this.viewDetailsModalElement.nativeElement);
    this.assignModal = new Modal(this.assignModalElement.nativeElement);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.towingRequestsUnsubscribe) {
      this.towingRequestsUnsubscribe();
      this.towingRequestsUnsubscribe = null;
    }
    this.isTowingRequestsListenerActive = false;
  }

  isLoading(action: string, requestId?: string): boolean {
    switch (action) {
      case 'accept':
        return requestId ? this.loadingStates.accept.has(requestId) : false;
      case 'decline':
        return requestId ? this.loadingStates.decline.has(requestId) : false;
      case 'assign':
        return requestId ? this.loadingStates.assign.has(requestId) : false;
      case 'complete':
        return requestId ? this.loadingStates.complete.has(requestId) : false;
      case 'refresh':
        return this.loadingStates.refresh;
      case 'loadMore':
        return this.loadingStates.loadMore;
      default:
        return false;
    }
  }

  setLoading(action: string, requestId?: string, loading: boolean = true): void {
    switch (action) {
      case 'accept':
        if (requestId) {
          loading ? this.loadingStates.accept.add(requestId) : this.loadingStates.accept.delete(requestId);
        }
        break;
      case 'decline':
        if (requestId) {
          loading ? this.loadingStates.decline.add(requestId) : this.loadingStates.decline.delete(requestId);
        }
        break;
      case 'assign':
        if (requestId) {
          loading ? this.loadingStates.assign.add(requestId) : this.loadingStates.assign.delete(requestId);
        }
        break;
      case 'complete':
        if (requestId) {
          loading ? this.loadingStates.complete.add(requestId) : this.loadingStates.complete.delete(requestId);
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

  async loadTowingRequests(forceRefresh: boolean = false) {
    // Prevent multiple simultaneous calls
    if (this.loading && !forceRefresh) return;

    this.loading = true;

    try {

      // Clean up existing listener if forcing refresh or one exists
      if (forceRefresh && this.towingRequestsUnsubscribe) {
        this.towingRequestsUnsubscribe();
        this.towingRequestsUnsubscribe = null;
        this.isTowingRequestsListenerActive = false;
      }

      // Only create new listener if needed
      if (!this.towingRequestsUnsubscribe) {
        await this.setupTowingRequestsListener();
      } else {
        // Listener already exists, just update loading state
        this.loading = false;
      }

    } catch (error) {
      console.error('Error setting up towing requests:', error);
      this.loading = false;
    }
  }

  private async setupTowingRequestsListener() {
    const q = query(
      collection(this.firestore, 'towing_requests'),
      where('serviceCenterId', '==', this.serviceCenterId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    console.log('Setting up towing requests listener for service center:', this.serviceCenterId);

    let isFirstLoad = true;

    this.towingRequestsUnsubscribe = onSnapshot(
      q,
      async (snapshot: QuerySnapshot<DocumentData>) => {

        // Skip the first load if it has very few documents due to likely cached data
        if (isFirstLoad && snapshot.docs.length < 5) {
          isFirstLoad = false;
          return;
        }

        isFirstLoad = false;

        this.lastVisible = snapshot.docs[snapshot.docs.length - 1];
        this.hasMoreData = snapshot.docs.length === 20;

        const requestsRaw = snapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as any)
        }));

        try {
          const enriched = await this.enrichTowingRequests(requestsRaw);

          const enrichedStatusCounts: { [key: string]: number } = {};
          enriched.forEach(req => {
            const status = req.status || 'unknown';
            enrichedStatusCounts[status] = (enrichedStatusCounts[status] || 0) + 1;
          });
          this.towingRequests = enriched;
          this.applyFilters();
          this.updateStats();

          console.log('Final filtered requests:', this.filteredRequests.length);
        } catch (enrichError) {
          console.error('Error enriching towing requests:', enrichError);
        } finally {
          this.loading = false;
          this.isTowingRequestsListenerActive = true;
        }
      },
      (error) => {
        console.error('Towing requests listener error:', error);
        this.loading = false;
        this.isTowingRequestsListenerActive = false;

        // Auto-retry after 5 seconds
        setTimeout(() => {
          if (!this.isTowingRequestsListenerActive) {
            console.log('Auto-retrying towing requests listener...');
            this.loadTowingRequests(true);
          }
        }, 5000);
      }
    );
  }

  async loadMoreTowingRequests() {
    if (!this.hasMoreData || this.loadingMore) return;

    this.setLoading('loadMore', undefined, true);
    this.loadingMore = true;

    try {
      if (!this.serviceCenterId) return;

      let q = query(
        collection(this.firestore, 'towing_requests'),
        where('serviceCenterId', '==', this.serviceCenterId),
        orderBy('createdAt', 'desc'),
        startAfter(this.lastVisible),
        limit(20)
      );

      const requestsSnap = await getDocs(q);
      this.lastVisible = requestsSnap.docs[requestsSnap.docs.length - 1];
      this.hasMoreData = requestsSnap.docs.length === 20;

      const requestsRaw = requestsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const enriched = await this.enrichTowingRequests(requestsRaw);

      this.towingRequests = [...this.towingRequests, ...enriched];
      this.applyFilters();
    } catch (error) {
      console.error('Error loading more towing requests:', error);
    }

    this.loadingMore = false;
    this.setLoading('loadMore', undefined, false);
  }

  async enrichTowingRequests(requestsRaw: any[]): Promise<any[]> {
    const enriched: any[] = [];

    for (const request of requestsRaw) {
      const enrichedRequest: any = { ...request };

      if (request.userId) {
        try {
          const userRef = doc(this.firestore, 'car_owners', request.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            enrichedRequest.customer = {
              id: request.userId,
              name: userData['name'],
              email: userData['email'],
              phone: userData['phone'] || request.contactNumber
            };
          }
        } catch (err) {
          console.warn('Failed to load customer for', request.userId, err);
        }
      }

      // Enrich driver data if dispatched
      if (request.driverId) {
        try {
          const driverRef = doc(this.firestore, 'drivers', request.driverId);
          const driverSnap = await getDoc(driverRef);
          if (driverSnap.exists()) {
            const driverData = driverSnap.data();
            enrichedRequest.driver = {
              id: request.driverId,
              ...driverData
            };
          }
        } catch (err) {
          console.warn('Failed to load driver for', request.driverId, err);
        }
      }

      enriched.push(enrichedRequest);
    }

    return enriched;
  }

  // Load drivers for assignment
  async loadDrivers() {
    try {
      if (!this.serviceCenterId) return;

      const driversSnap = await getDocs(query(
        collection(this.firestore, 'drivers'),
        where('serviceCenterId', '==', this.serviceCenterId),
        where('status', '==', 'approved')
      ));

      this.drivers = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.driverMap = Object.fromEntries(this.drivers.map(driver => [driver.id, driver.name || driver.id]));
    } catch (err) {
      console.error('Failed loading drivers', err);
    }
  }

  // Filter methods
  applyFilters() {
    let filtered = [...this.towingRequests];

    // Status filter
    if (this.statusFilter && this.statusFilter !== 'all') {
      filtered = filtered.filter(request => request.status === this.statusFilter);
    }

    // Date filter
    if (this.dateFrom) {
      const fromDate = new Date(this.dateFrom);
      filtered = filtered.filter(request => {
        const requestDate = request.createdAt?.toDate?.() || new Date(request.createdAt);
        return requestDate >= fromDate;
      });
    }

    if (this.dateTo) {
      const toDate = new Date(this.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(request => {
        const requestDate = request.createdAt?.toDate?.() || new Date(request.createdAt);
        return requestDate <= toDate;
      });
    }

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(request =>
        request.customer?.name?.toLowerCase().includes(term) ||
        request.vehicleInfo?.make?.toLowerCase().includes(term) ||
        request.vehicleInfo?.model?.toLowerCase().includes(term) ||
        request.vehicleInfo?.plateNumber?.toLowerCase().includes(term) ||
        request.towingType?.toLowerCase().includes(term) ||
        request.location?.address?.toLowerCase().includes(term)
      );
    }

    this.filteredRequests = filtered;
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
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        this.dateFrom = yesterday.toISOString().split('T')[0];
        this.dateTo = yesterday.toISOString().split('T')[0];
        break;
      case 'this_week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        this.dateFrom = startOfWeek.toISOString().split('T')[0];
        this.dateTo = endOfWeek.toISOString().split('T')[0];
        break;
      case 'pending':
        this.statusFilter = 'pending';
        this.dateFrom = '';
        this.dateTo = '';
        break;
      case 'accepted':
        this.statusFilter = 'accepted';
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

  // Action methods
  canAccept(request: any): boolean {
    return request && request.status === 'pending';
  }

  canDecline(request: any): boolean {
    return request && request.status === 'pending';
  }

  canAssign(request: any): boolean {
    return request && (request.status === 'accepted' || request.status === 'dispatched');
  }

  canComplete(request: any): boolean {
    return request && request.status === 'ongoing';
  }

  canMarkAsOngoing(request: any): boolean {
    return request && request.status === 'dispatched';
  }

  async acceptRequest(request: any) {
    if (this.isLoading('accept', request.id)) return;

    if (confirm('Accept this towing request?')) {
      this.setLoading('accept', request.id, true);

      try {
        const updateData: any = {
          status: 'accepted',
          updatedAt: Timestamp.now(),
          statusUpdatedBy: this.auth.getAdminName?.() || 'system',
          timestamps: {
            ...request.timestamps,
            acceptedAt: Timestamp.now()
          },
          statusHistory: [
            ...(request.statusHistory || []),
            {
              status: 'accepted',
              timestamp: Timestamp.now(),
              updatedBy: this.auth.getAdminName?.() || 'system',
              notes: 'Request accepted by service center'
            }
          ]
        };

        await updateDoc(doc(this.firestore, 'towing_requests', request.id), updateData);
        await this.sendTowingStatusUpdateEmail(request, 'accepted');
      } catch (error) {
        console.error('Error accepting towing request:', error);
        alert('Failed to accept towing request. Please try again.');
      } finally {
        this.setLoading('accept', request.id, false);
      }
    }
  }

  async declineRequest(request: any) {
    if (this.isLoading('decline', request.id)) return;

    if (confirm('Decline this towing request?')) {
      this.setLoading('decline', request.id, true);

      try {
        const updateData: any = {
          status: 'declined',
          updatedAt: Timestamp.now(),
          statusUpdatedBy: this.auth.getAdminName?.() || 'system',
          timestamps: {
            ...request.timestamps,
            cancelledAt: Timestamp.now()
          },
          statusHistory: [
            ...(request.statusHistory || []),
            {
              status: 'declined',
              timestamp: Timestamp.now(),
              updatedBy: this.auth.getAdminName?.() || 'system',
              notes: 'Request declined by service center'
            }
          ]
        };

        await updateDoc(doc(this.firestore, 'towing_requests', request.id), updateData);
        await this.sendTowingStatusUpdateEmail(request, 'declined');
      } catch (error) {
        console.error('Error declining towing request:', error);
        alert('Failed to decline towing request. Please try again.');
      } finally {
        this.setLoading('decline', request.id, false);
      }
    }
  }

  openAssignModal(request: any) {
    this.viewDetailsModal.hide();
    setTimeout(() => {
      this.selectedRequest = request;
      this.selectedDriver = request.driverId || '';
      this.assignmentNotes = '';
      this.assignModal.show();
    }, 300);
  }

  async saveAssignment() {
    if (!this.selectedRequest || !this.selectedDriver) {
      alert('Please select a driver');
      return;
    }

    if (this.isLoading('assign', this.selectedRequest.id)) return;

    this.setLoading('assign', this.selectedRequest.id, true);

    try {
      const selectedDriverData = this.drivers.find(driver => driver.id === this.selectedDriver);

      if (!selectedDriverData) {
        alert('Selected driver not found');
        return;
      }

      const updateData: any = {
        driverId: this.selectedDriver,
        status: 'dispatched',
        updatedAt: Timestamp.now(),
        statusUpdatedBy: this.auth.getAdminName?.() || 'system',
        timestamps: {
          ...this.selectedRequest.timestamps,
          dispatchedAt: Timestamp.now(),
          driverAssignedAt: Timestamp.now()
        },
        statusHistory: [
          ...(this.selectedRequest.statusHistory || []),
          {
            status: 'dispatched',
            timestamp: Timestamp.now(),
            updatedBy: this.auth.getAdminName?.() || 'system',
            notes: `Driver ${selectedDriverData.name} assigned and dispatched`
          }
        ]
      };

      updateData.driverInfo = {
        name: selectedDriverData.name || 'N/A',
        contactNumber: selectedDriverData.phoneNo || 'N/A',
        email: selectedDriverData.email || 'N/A',
        driverImage: selectedDriverData.driverImage || '',
      };

      updateData.driverVehicleInfo = {
        carPlate: selectedDriverData.carPlate || 'N/A',
        make: selectedDriverData.make || 'N/A',
        model: selectedDriverData.model || 'N/A',
        year: selectedDriverData.year || 'N/A',
        vehicleImage: selectedDriverData.vehicleImages || '',
      };

      if (this.assignmentNotes) {
        updateData.assignmentNotes = this.assignmentNotes;
      }

      await updateDoc(doc(this.firestore, 'towing_requests', this.selectedRequest.id), updateData);
      await this.sendTowingStatusUpdateEmail(this.selectedRequest, 'dispatched');

      this.assignModal.hide();
      this.selectedRequest = null;
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('Failed to save assignment. Please try again.');
    } finally {
      this.setLoading('assign', this.selectedRequest?.id, false);
    }
  }

  async markAsOngoing(request: any) {
    if (this.isLoading('ongoing', request.id)) return;

    if (confirm('Mark this towing request as ongoing? This indicates the driver has arrived at the location and is ready to assist.')) {
      this.setLoading('ongoing', request.id, true);

      try {
        const updateData: any = {
          status: 'ongoing',
          updatedAt: Timestamp.now(),
          statusUpdatedBy: this.auth.getAdminName?.() || 'system',
          timestamps: {
            ...request.timestamps,
            arrivedAtLocationAt: Timestamp.now(),
            serviceStartedAt: Timestamp.now()
          },
          statusHistory: [
            ...(request.statusHistory || []),
            {
              status: 'ongoing',
              timestamp: Timestamp.now(),
              updatedBy: this.auth.getAdminName?.() || 'system',
              notes: 'Driver arrived at location and service started'
            }
          ]
        };

        await updateDoc(doc(this.firestore, 'towing_requests', request.id), updateData);
        await this.sendTowingStatusUpdateEmail(request, 'ongoing');
      } catch (error) {
        console.error('Error updating towing request to ongoing:', error);
        alert('Failed to update status. Please try again.');
      } finally {
        this.setLoading('ongoing', request.id, false);
      }
    }
  }

  private async sendTowingStatusUpdateEmail(request: any, status: string) {
    try {
      const customerEmail = request.customer?.email || request.userEmail;

      if (!customerEmail) {
        console.warn('No customer email found for towing request:', request.id);
        return;
      }

      let driverInfo = 'Driver will be dispatched shortly';
      let driverVehicleInfo = 'Vehicle will be assigned shortly';

      if (status === 'dispatched' && this.selectedDriver) {
        const selectedDriverData = this.drivers.find(driver => driver.id === this.selectedDriver);
        if (selectedDriverData) {
          driverInfo = this.getDriverInfo(selectedDriverData);
          driverVehicleInfo = this.getDriverVehicleInfo(selectedDriverData);
        }
      } else if (request.driverInfo && request.driverVehicleInfo) {
        driverInfo = `${request.driverInfo.name} (${request.driverInfo.contactNumber || 'Contact available'})`;
        driverVehicleInfo = `${request.driverVehicleInfo.carPlate} - ${request.driverVehicleInfo.make} ${request.driverVehicleInfo.model} (${request.driverVehicleInfo.year})`;
      }

      const emailData = {
        toEmail: customerEmail,
        customerName: request.customer?.name || 'Customer',
        requestId: request.id,
        status: status,
        vehicleInfo: this.getTowingVehicleInfo(request),
        pickupLocation: this.getPickupLocation(request),
        destination: this.getDestination(request),
        estimatedArrival: this.getEstimatedArrival(status),
        driverInfo: driverInfo,
        driverVehicleInfo: driverVehicleInfo,
        driverContactNumber: this.getDriverContactNumber(request),
        towingType: request.towingType || 'General Towing',
        requestedAt: request.createdAt?.toDate?.()?.toLocaleString() || new Date(request.createdAt).toLocaleString(),
        serviceCenterName: this.auth.getServiceCenterName?.() || 'AutoMate Towing Services',
        notes: this.getTowingStatusNotes(status, driverInfo, driverVehicleInfo)
      };

      const data = await firstValueFrom(
        this.http.post<any>('http://localhost:3000/serviceStatusUpdate/towing-request-status', emailData)
      );

      console.log('Towing email notification sent successfully:', data);

    } catch (error) {
      console.error('Failed to send towing email notification:', error);
    }
  }

  async openTowingInvoice(request: any) {
    if (this.isLoading('invoice', request.id)) return;

    this.setLoading('invoice', request.id, true);

    try {
      if (request.invoiceId) {
        // View existing invoice
        const url = `/towing-invoice/${request.invoiceId}/${this.auth.getAdminName?.() || 'system'}`;
        window.open(url, '_blank');
      } else {
        if (request.status === 'ongoing' || request.status === 'completed') {
          const url = `/towing-invoice/towing-request/${request.id}/${this.auth.getAdminName?.() || 'system'}`;
          window.open(url, '_blank');
        } else {
          alert('Cannot generate invoice. Towing must be ongoing or completed first.');
        }
      }
    } catch (error) {
      console.error('Error opening invoice:', error);
      alert('Failed to open invoice. Please try again.');
    } finally {
      this.setLoading('invoice', request.id, false);
    }
  }

  async viewTowingReceipt(request: any) {
    if (this.isLoading('receipt', request.id)) return;

    this.setLoading('receipt', request.id, true);

    try {
      let receiptData: any = null;
      let mode = 'view-receipt';

      const isPaid = request.payment?.status === 'paid';

      if (!isPaid && request.invoiceId) {
        mode = 'payment';
        const invoiceRef = doc(this.firestore, 'towing_invoices', request.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);

        if (invoiceSnap.exists()) {
          const invoiceData: any = { id: invoiceSnap.id, ...invoiceSnap.data() };
          receiptData = {
            receiptId: 'TEMP-REC-' + request.invoiceId,
            invoiceId: request.invoiceId,
            towingRequestId: request.id,
            customerInfo: invoiceData.customerInfo || request.customer,
            vehicleInfo: invoiceData.vehicleInfo || request.vehicleInfo,
            totalAmount: invoiceData.pricing?.totalAmount || 0,
            type: 'temp_receipt'
          };
        }
      } else if (request.payment?.receiptId) {
        mode = 'view-receipt';
        const receiptRef = doc(this.firestore, 'towing_receipts', request.payment.receiptId);
        const receiptSnap = await getDoc(receiptRef);
        if (receiptSnap.exists()) {
          receiptData = { id: receiptSnap.id, ...receiptSnap.data() };
        }
      } else if (request.invoiceId) {
        const receiptsSnap = await getDocs(query(
          collection(this.firestore, 'towing_receipts'),
          where('invoiceId', '==', request.invoiceId),
          limit(1)
        ));

        if (!receiptsSnap.empty) {
          mode = 'view-receipt';
          receiptData = { id: receiptsSnap.docs[0].id, ...receiptsSnap.docs[0].data() };
        } else {
          mode = 'payment';
        }
      }

      if (receiptData || mode === 'payment') {
        const url = this.createTowingPaymentUrl(request.id, mode, receiptData?.receiptId || receiptData?.id);

        const receiptKey = `towing_receipt_${request.id}`;
        const storageData = {
          receiptId: receiptData?.receiptId || receiptData?.id,
          invoiceId: receiptData?.invoiceId || request.invoiceId,
          mode: mode,
          serviceCenterId: request.serviceCenterId,
          requestId: request.id
        };

        // Clear any existing data first to free up space
        this.clearOldReceiptData();

        sessionStorage.setItem(receiptKey, JSON.stringify(storageData));
        window.open(url, '_blank');
      } else {
        alert('No receipt found for this towing request. Please generate an invoice first.');
      }

    } catch (error) {
      console.error('Error loading receipt:', error);
      alert('Failed to load receipt. Please try again.');
    } finally {
      this.setLoading('receipt', request.id, false);
    }
  }

  private clearOldReceiptData(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('towing_receipt_')) {
        keysToRemove.push(key);
      }
    }

    // remove older ones
    if (keysToRemove.length > 5) {
      keysToRemove.sort().slice(0, keysToRemove.length - 5).forEach(key => {
        sessionStorage.removeItem(key);
      });
    }
  }

  async makeTowingPayment(request: any) {
    if (this.isLoading('payment', request.id)) return;

    this.setLoading('payment', request.id, true);

    try {
      if (!request.invoiceId) {
        alert('Cannot process payment. No invoice found for this towing request. Please generate an invoice first.');
        return;
      }

      const url = this.createTowingPaymentUrl(request.id, 'payment');

      // Store request data with proper structure
      const receiptKey = `towing_receipt_${request.id}`;
      sessionStorage.setItem(receiptKey, JSON.stringify({
        request: request,
        mode: 'payment'
      }));

      window.open(url, '_blank');

    } catch (error) {
      console.error('Error redirecting to payment:', error);
      alert('Failed to open payment page. Please try again.');
    } finally {
      this.setLoading('payment', request.id, false);
    }
  }

  private createTowingPaymentUrl(requestId: string, mode: string, receiptId?: string): string {
    const baseUrl = `/towing-payment/${requestId}/${this.auth.getAdminName?.() || 'system'}`;
    const params = new URLSearchParams();
    params.set('mode', mode);
    if (receiptId) {
      params.set('receiptId', receiptId);
    }
    return `${baseUrl}?${params.toString()}`;
  }

  // Add canGenerateInvoice method
  canGenerateInvoice(request: any): boolean {
    return request && request.status === 'ongoing' && !request.invoiceId;
  }

  canViewInvoice(request: any): boolean {
    return request && request.invoiceId;
  }

  canMakePayment(request: any): boolean {
    return request && request.invoiceId && request.payment?.status !== 'paid';
  }

  canViewReceipt(request: any): boolean {
    return request && request.payment?.status === 'paid';
  }

  private getTowingVehicleInfo(request: any): string {
    if (request.vehicleInfo) {
      const vehicle = request.vehicleInfo;
      return `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.plateNumber ? `(${vehicle.plateNumber})` : ''}`.trim();
    }
    return 'Vehicle information not available';
  }

  private getPickupLocation(request: any): string {
    if (request.location?.address) {
      return request.location.address;
    }
    if (request.pickupLocation) {
      return request.pickupLocation;
    }
    return 'Location information not available';
  }

  private getDestination(request: any): string {
    if (request.destination) {
      return request.destination;
    }
    if (request.serviceCenterName) {
      return request.serviceCenterName;
    }
    return this.auth.getServiceCenterName?.() || 'AutoMate Service Center';
  }

  private getEstimatedArrival(status: string): string {
    const estimates: { [key: string]: string } = {
      'accepted': '15-30 minutes',
      'dispatched': '10-20 minutes',
      'completed': 'Vehicle delivered'
    };
    return estimates[status] || 'To be confirmed';
  }

  private getDriverInfo(driverData: any): string {
    if (!driverData) return 'Driver will be dispatched shortly';

    return `${driverData.name || 'Driver'} (${driverData.phoneNo || driverData.contactNumber || 'Contact available upon dispatch'})`;
  }

  private getDriverVehicleInfo(driverData: any): string {
    if (!driverData) return 'Vehicle will be assigned shortly';

    if (driverData.carPlate) {
      return `${driverData.carPlate} - ${driverData.make || ''} ${driverData.model || ''} (${driverData.year || ''})`.trim();
    }
    return 'Vehicle details to be confirmed';
  }

  private getDriverContactNumber(request: any): string {
    if (request.driverInfo?.contactNumber && request.driverInfo.contactNumber !== 'N/A') {
      return request.driverInfo.contactNumber;
    }

    const selectedDriverData = this.drivers.find(driver => driver.id === this.selectedDriver);
    if (selectedDriverData?.phoneNo) {
      return selectedDriverData.phoneNo;
    }

    return 'Contact number will be provided upon dispatch';
  }

  private getTowingStatusNotes(status: string, driverInfo: string, driverVehicleInfo: string): string {
    const notes: { [key: string]: string } = {
      'accepted': 'Your towing request has been accepted. A driver will be dispatched to your location shortly.',
      'dispatched': `Your towing service has been dispatched. ${driverInfo} with ${driverVehicleInfo} will contact you upon arrival.`,
      'ongoing': 'The driver has arrived at your location and the towing service is in progress.',
      'completed': 'Your towing service has been completed. Your vehicle has been safely delivered to our service center.',
      'declined': 'We are unable to accommodate your towing request at this time. Please contact us for any further assistance.'
    };

    return notes[status] || 'Your towing request status has been updated.';
  }

  viewDetails(request: any) {
    this.selectedRequest = request;
    this.viewDetailsModal.show();
  }

  async refreshTowingRequests() {
    console.log('Manual refresh triggered for towing requests');
    await this.loadTowingRequests(true);
  }

  refreshData(): void {
    if (this.isLoading('refresh')) return;

    this.setLoading('refresh', undefined, true);

    Promise.all([
      this.refreshTowingRequests(),
      this.loadDrivers()
    ]).finally(() => {
      this.setLoading('refresh', undefined, false);
    });
  }

  getStatusBadgeClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'bg-warning text-dark',
      'accepted': 'bg-info text-white',
      'dispatched': 'bg-primary text-white',
      'ongoing': 'bg-orange text-white',
      'completed': 'bg-success text-white',
      'declined': 'bg-danger text-white',
      'removed': 'bg-secondary text-white'
    };
    return `badge ${classes[status] || 'bg-secondary'}`;
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'pending': 'bi-clock',
      'accepted': 'bi-check-circle',
      'dispatched': 'bi-person-check',
      'ongoing': 'bi-geo-alt',
      'completed': 'bi-check-lg',
      'declined': 'bi-x-circle',
      'removed': 'bi-trash'
    };
    return icons[status] || 'bi-question-circle';
  }

  getStatusText(status: string): string {
    const texts: { [key: string]: string } = {
      'pending': 'Pending',
      'accepted': 'Accepted',
      'dispatched': 'Dispatched',
      'ongoing': 'Ongoing',
      'completed': 'Completed',
      'declined': 'Declined',
      'removed': 'Removed'
    };
    return texts[status] || status;
  }

  getTowingTypeIcon(towingType: string): string {
    const icons: { [key: string]: string } = {
      'Out of Fuel': 'bi-fuel-pump',
      'Flat Tire': 'bi-tire',
      'Engine Failure': 'bi-gear',
      'Accident': 'bi-exclamation-triangle',
      'Battery Issue': 'bi-battery',
      'Lockout': 'bi-lock'
    };
    return icons[towingType] || 'bi-truck';
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

  formatDistance(distance: number): string {
    if (distance === 0) return '0 km';
    else if (!distance) return 'N/A';
    return `${distance.toFixed(1)} km`;
  }

  trackByRequestId(index: number, request: any): string {
    return request.id;
  }

  updateStats(): void {
    this.stats[0].count = this.towingRequests.filter(r => r.status === 'pending').length;
    this.stats[1].count = this.towingRequests.filter(r => r.status === 'accepted').length;
    this.stats[2].count = this.towingRequests.filter(r => r.status === 'dispatched').length;
    this.stats[3].count = this.towingRequests.filter(r => r.status === 'ongoing').length;
    this.stats[4].count = this.towingRequests.filter(r => r.status === 'completed').length;
  }

}