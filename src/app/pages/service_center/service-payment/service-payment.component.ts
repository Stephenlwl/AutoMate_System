import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, setDoc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-service-payment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './service-payment.component.html'
})
export class ServicePaymentComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  adminName: string | null = null;
  booking: any = null;
  invoice: any = null;
  bookingId: string = '';
  serviceCenterInfo: any = null;

  // Payment Form
  paymentMethod: string = 'cash';
  amountPaid: number = 0;
  paymentNotes: string = '';
  cardNumber: string = '';
  cardExpiry: string = '';
  cardCVV: string = '';

  // E-Wallet properties
  ewalletProvider: string = '';
  ewalletTransactionId: string = '';
  ewalletReference: string = '';
  ewalletPhone: string = '';

  // Card properties
  cardAuthCode: string = '';
  cardTerminalId: string = '';

  // Bank transfer properties
  bankName: string = '';
  bankReference: string = '';
  bankTransactionDate: string = '';
  bankAmount: number = 0;

  // Cash properties
  cashTendered: number = 0;
  cashChange: number = 0;

  // Receipt Data
  receiptGenerated: boolean = false;
  receiptData: any = null;
  mode: string = 'view-receipt'; // 'payment' or 'view-receipt'

  async ngOnInit() {
    this.bookingId = this.route.snapshot.paramMap.get('id') || '';
    this.adminName = this.route.snapshot.paramMap.get('adminName') || '';

    const queryParams = this.route.snapshot.queryParams;
    const mode = queryParams['mode'];
    const receiptId = queryParams['receiptId'];

    if (mode === 'view-receipt') {
      const receiptKey = `receipt_${this.bookingId}`;
      const storedReceipt = sessionStorage.getItem(receiptKey);

      if (storedReceipt) {
        const receiptData = JSON.parse(storedReceipt);
        this.receiptData = receiptData.receiptData;
        this.booking = receiptData.booking;
        this.receiptGenerated = true;
        this.mode = 'view-receipt';

        if (this.receiptData.serviceCenterId) {
          await this.loadServiceCenterInfo(this.receiptData.serviceCenterId);
        }

        // Clean up sessionStorage
        sessionStorage.removeItem(receiptKey);
        return;
      }

      // load from Firestore if sessionStorage doesn't have data
      if (receiptId) {
        await this.loadReceiptById(receiptId);
        return;
      }
    }

    // for payment mode
    const navigation = this.router.getCurrentNavigation();
    const navigationState = navigation?.extras?.state as any;

    if (navigationState?.mode === 'view-receipt' && navigationState.receiptData) {
      this.mode = 'view-receipt';
      this.receiptData = navigationState.receiptData;
      this.receiptGenerated = true;

      if (navigationState.booking) {
        this.booking = navigationState.booking;
      }

      if (this.receiptData.serviceCenterId) {
        await this.loadServiceCenterInfo(this.receiptData.serviceCenterId);
      }
      return;
    }

    if (this.bookingId) {
      await this.loadBookingAndInvoice();
    }
  }

  async loadReceiptById(receiptId: string) {
    try {
      if (receiptId.startsWith('REC-')) {
        // temporary receipt load from invoice
        const invoiceId = receiptId.replace('REC-', '');
        await this.loadBookingAndInvoice();
      } else {
        const receiptRef = doc(this.firestore, 'service_receipts', receiptId);
        const receiptSnap = await getDoc(receiptRef);

        if (receiptSnap.exists()) {
          this.receiptData = { id: receiptSnap.id, ...receiptSnap.data() };
          this.receiptGenerated = true;
          this.mode = 'view-receipt';

          // Load booking data
          await this.loadBooking();

          // Load service center info
          if (this.receiptData.serviceCenterId) {
            await this.loadServiceCenterInfo(this.receiptData.serviceCenterId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading receipt:', error);
      alert('Failed to load receipt data.');
    }
  }

  async loadBookingAndInvoice() {
    try {
      // Load booking
      await this.loadBooking();

      // Load invoice
      if (this.booking?.invoiceId) {
        const invoiceRef = doc(this.firestore, 'service_invoice', this.booking.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);

        if (invoiceSnap.exists()) {
          this.invoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
          console.log('Loaded Invoice:', this.invoice);

          // Load service center info
          if (this.booking.serviceCenterId) {
            await this.loadServiceCenterInfo(this.booking.serviceCenterId);
          }

          // Set amount paid to invoice total if not already set
          if (!this.amountPaid && this.invoice.totalAmount) {
            this.amountPaid = this.invoice.totalAmount;
          }
        }
      }
    } catch (error) {
      console.error('Error loading booking and invoice:', error);
      alert('Failed to load payment details');
    }
  }

  async loadBooking() {
    try {
      const bookingRef = doc(this.firestore, 'service_bookings', this.bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        this.booking = { id: bookingSnap.id, ...bookingSnap.data() };
        console.log('Loaded Booking:', this.booking);
      } else {
        alert('Booking not found');
      }
    } catch (error) {
      console.error('Error loading booking:', error);
      alert('Failed to load booking details');
    }
  }

  async loadServiceCenterInfo(scId: string) {
    try {
      const scRef = doc(this.firestore, 'service_centers', scId);
      const scSnap = await getDoc(scRef);

      if (scSnap.exists()) {
        this.serviceCenterInfo = {
          id: scSnap.id,
          ...scSnap.data()
        };
        console.log('Loaded Service Center:', this.serviceCenterInfo);
      }
    } catch (error) {
      console.error('Failed loading service center info', error);
    }
  }

  hasInvoiceParts(): boolean {
    if (!this.invoice) return false;

    const hasBookedServiceParts = this.invoice.bookedServices?.some((service: any) =>
      service.parts && service.parts.length > 0
    );
    const hasAdditionalServiceParts = this.invoice.additionalServices?.some((service: any) =>
      service.parts && service.parts.length > 0
    );
    const hasStandaloneParts = this.invoice.standaloneParts && this.invoice.standaloneParts.length > 0;

    return hasBookedServiceParts || hasAdditionalServiceParts || hasStandaloneParts;
  }

  getTotalPartsCount(services: any[]): number {
    if (!services || !Array.isArray(services)) return 0;

    return services.reduce((total, service) => {
      return total + (service.parts && Array.isArray(service.parts) ? service.parts.length : 0);
    }, 0);
  }

  onPaymentMethodChange() {
    this.ewalletProvider = '';
    this.ewalletTransactionId = '';
    this.ewalletReference = '';
    this.ewalletPhone = '';
    this.cardNumber = '';
    this.cardExpiry = '';
    this.cardCVV = '';
    this.cardAuthCode = '';
    this.cardTerminalId = '';
    this.bankName = '';
    this.bankReference = '';
    this.bankTransactionDate = '';
    this.bankAmount = 0;
    this.cashTendered = 0;
    this.cashChange = 0;
  }

  onAmountPaidChange() {
    if (this.paymentMethod === 'cash') {
      this.cashTendered = this.amountPaid;
      this.calculateCashChange();
    }

    if (this.paymentMethod === 'bank_transfer') {
      this.bankAmount = this.amountPaid;
    }
  }

  calculateCashChange() {
    if (this.paymentMethod === 'cash' && this.cashTendered > 0) {
      const remainingBalance = this.getRemainingBalance();
      this.cashChange = Math.max(0, this.cashTendered - this.amountPaid);
    } else {
      this.cashChange = 0;
    }
  }

  getPreviousAmountPaid(): number {
    if (!this.invoice) return 0;
    return this.invoice.payment?.amountPaid || 0;
  }

  // Calculate remaining balance
  getRemainingBalance(): number {
    if (!this.invoice) return 0;
    const totalAmount = this.invoice.totalAmount || 0;
    const previousPaid = this.getPreviousAmountPaid();
    return Math.max(0, totalAmount - previousPaid);
  }

  getPaymentStatusBadge(): string {
    if (!this.amountPaid || this.amountPaid <= 0) {
      return 'bg-secondary';
    }

    const remainingBalance = this.getRemainingBalance();

    if (this.amountPaid >= remainingBalance) {
      return 'bg-success';
    } else if (this.amountPaid > 0) {
      return 'bg-warning';
    } else {
      return 'bg-secondary';
    }
  }

  getPaymentStatusText(): string {
    if (!this.amountPaid || this.amountPaid <= 0) {
      return 'No Payment';
    }

    const remainingBalance = this.getRemainingBalance();

    if (this.amountPaid >= remainingBalance) {
      return 'Full Settlement';
    } else if (this.amountPaid > 0) {
      return 'Additional Payment';
    } else {
      return 'No Payment';
    }
  }

  getPaymentButtonText(): string {
    if (!this.amountPaid || this.amountPaid <= 0) {
      return 'Process Payment';
    }

    const remainingBalance = this.getRemainingBalance();
    const previousPaid = this.getPreviousAmountPaid();

    if (this.amountPaid >= remainingBalance) {
      return `Settle Balance (${this.formatCurrency(remainingBalance)})`;
    } else if (previousPaid > 0) {
      return `Add Payment (${this.formatCurrency(this.amountPaid)})`;
    } else {
      return `Process Payment (${this.formatCurrency(this.amountPaid)})`;
    }
  }

  async processPayment() {
    if (!this.booking || !this.invoice) {
      alert('Missing booking or invoice data');
      return;
    }

    if (!this.paymentMethod || !this.amountPaid || this.amountPaid <= 0) {
      alert('Please fill in all required payment details');
      return;
    }

    const isFullPayment = this.amountPaid >= this.invoice.totalAmount;
    const isPartialPayment = this.amountPaid > 0 && this.amountPaid < this.invoice.totalAmount;

    if (isPartialPayment) {
      if (!confirm(`This is a partial payment of ${this.formatCurrency(this.amountPaid)}. Balance due: ${this.formatCurrency(this.invoice.totalAmount - this.amountPaid)}. Continue?`)) {
        return;
      }
    }

    try {
      // Determine payment status based on amount paid
      const paymentStatus = isFullPayment ? 'paid' : 'partial';
      const bookingStatus = isFullPayment ? 'completed' : 'pending_payment';

      // Update invoice with payment details
      const invoiceUpdate: any = {
        'payment.method': this.paymentMethod,
        'payment.status': paymentStatus,
        'payment.paidAt': Timestamp.now(),
        'payment.amountPaid': this.amountPaid,
        'payment.notes': this.paymentNotes,
        'payment.balanceDue': Math.max(0, this.invoice.totalAmount - this.amountPaid),
        status: paymentStatus,
        updatedAt: Timestamp.now()
      };

      if (this.paymentMethod === 'card') {
        invoiceUpdate['payment.cardLastFour'] = this.cardNumber.slice(-4);
        invoiceUpdate['payment.transactionId'] = this.generateTransactionId();
        invoiceUpdate['payment.authorizationCode'] = this.cardAuthCode;
        invoiceUpdate['payment.terminalId'] = this.cardTerminalId;
      } else if (this.paymentMethod === 'ewallet') {
        invoiceUpdate['payment.ewalletProvider'] = this.ewalletProvider;
        invoiceUpdate['payment.ewalletTransactionId'] = this.ewalletTransactionId;
        invoiceUpdate['payment.ewalletReference'] = this.ewalletReference;
        invoiceUpdate['payment.ewalletPhone'] = this.ewalletPhone;
      } else if (this.paymentMethod === 'bank_transfer') {
        invoiceUpdate['payment.bankName'] = this.bankName;
        invoiceUpdate['payment.bankReference'] = this.bankReference;
        invoiceUpdate['payment.bankTransactionDate'] = this.bankTransactionDate;
        invoiceUpdate['payment.bankAmount'] = this.bankAmount;
      } else if (this.paymentMethod === 'cash') {
        invoiceUpdate['payment.cashTendered'] = this.cashTendered;
        invoiceUpdate['payment.cashChange'] = this.cashChange;
      }

      await updateDoc(doc(this.firestore, 'service_invoice', this.invoice.id), invoiceUpdate);

      // Create receipt even for partial payments
      const receiptRef = doc(collection(this.firestore, 'service_receipts'));
      const receiptId = receiptRef.id;

      const receipt = {
        receiptId: receiptId,
        invoiceId: this.invoice.id,
        serviceBookingId: this.booking.id,
        serviceCenterId: this.booking.serviceCenterId,
        userId: this.booking.userId,
        vehicleId: this.booking.vehicleId,

        // Customer and Vehicle Info
        customerInfo: this.invoice.customerInfo || {
          name: this.booking.customer?.name || 'N/A',
          email: this.booking.customer?.email || 'N/A',
          phone: this.booking.customer?.phone || 'N/A',
        },
        vehicleInfo: this.invoice.vehicleInfo || {
          make: this.booking.vehicle?.make || 'N/A',
          model: this.booking.vehicle?.model || 'N/A',
          year: this.booking.vehicle?.year || 'N/A',
          plateNumber: this.booking.vehicle?.plateNumber || 'N/A',
          vin: this.booking.vehicle?.vin || 'N/A'
        },

        mileage: this.invoice.mileage || {
          beforeService: this.booking.mileage?.beforeService || 0,
          afterService: this.booking.mileage?.afterService || 0
        },

        // Services Data
        bookedServices: this.invoice.bookedServices || [],
        packageServices: this.invoice.packageServices || [],
        additionalServices: this.invoice.additionalServices || [],
        standaloneParts: this.invoice.standaloneParts || [],

        // Financial Data
        labourSubtotal: this.invoice.labourSubtotal || 0,
        partsSubtotal: this.invoice.partsSubtotal || 0,
        subtotal: this.invoice.subtotal || 0,
        taxAmount: this.invoice.taxAmount || 0,
        totalAmount: this.invoice.totalAmount || 0,
        amountPaid: this.amountPaid,
        balanceDue: Math.max(0, this.invoice.totalAmount - this.amountPaid),

        // Payment Information
        payment: {
          method: this.paymentMethod,
          status: paymentStatus,
          paidAt: Timestamp.now(),
          notes: this.paymentNotes,
          amountPaid: this.amountPaid,
          balanceDue: Math.max(0, this.invoice.totalAmount - this.amountPaid),
          // Add method-specific details
          ...(this.paymentMethod === 'card' && {
            cardLastFour: this.cardNumber.slice(-4),
            transactionId: this.generateTransactionId(),
            authorizationCode: this.cardAuthCode,
            terminalId: this.cardTerminalId
          }),
          ...(this.paymentMethod === 'ewallet' && {
            ewalletProvider: this.ewalletProvider,
            ewalletTransactionId: this.ewalletTransactionId,
            ewalletReference: this.ewalletReference,
            ewalletPhone: this.ewalletPhone
          }),
          ...(this.paymentMethod === 'bank_transfer' && {
            bankName: this.bankName,
            bankReference: this.bankReference,
            bankTransactionDate: this.bankTransactionDate,
            bankAmount: this.bankAmount
          }),
          ...(this.paymentMethod === 'cash' && {
            cashTendered: this.cashTendered,
            cashChange: this.cashChange
          })
        },

        // Warranty Information
        warranty: {
          labour: {
            days: this.invoice.warranty.labour.days,
            notes: this.invoice.warranty.labour.notes,
            startDate: this.invoice.warranty.labour.startDate,
            endDate: this.calculateWarrantyEndDate(this.invoice.warranty.labour.days) ?
              Timestamp.fromDate(this.calculateWarrantyEndDate(this.invoice.warranty.labour.days)!) : null
          },
          parts: {
            days: this.invoice.warranty.parts.days,
            notes: this.invoice.warranty.parts.notes,
            startDate: this.invoice.warranty.parts.startDate,
            endDate: this.calculateWarrantyEndDate(this.invoice.warranty.parts.days) ?
              Timestamp.fromDate(this.calculateWarrantyEndDate(this.invoice.warranty.parts.days)!) : null
          },
          generalTerms: this.invoice.warranty.generalTerms,
          exclusions: this.invoice.warranty.exclusions,
          issuedAt: this.invoice.warranty.issuedAt || Timestamp.now(),
        },

        issuedAt: Timestamp.now(),
        issuedBy: this.serviceCenterInfo?.serviceCenterInfo?.name + ' - ' + this.adminName || 'system',
        type: isFullPayment ? 'final_receipt' : 'partial_receipt',
        status: paymentStatus
      };

      await setDoc(receiptRef, receipt);

       const bookingUpdate: any = {
      receiptId: receiptId,
      status: bookingStatus,
      'payment.method': this.paymentMethod,
      'payment.status': paymentStatus,
      'payment.total': this.amountPaid,
      'payment.paidAt': Timestamp.now(),
      'payment.balanceDue': Math.max(0, this.invoice.totalAmount - this.amountPaid),
      updatedAt: Timestamp.now(),
      statusUpdatedBy: this.adminName || 'system'
    };

    const paymentStatusText = isFullPayment ? 'completed' : 'pending_payment';
    const paymentNotes = isFullPayment 
      ? `Full payment of ${this.formatCurrency(this.amountPaid)} received. Service completed.` 
      : `Partial payment of ${this.formatCurrency(this.amountPaid)} received. Balance due: ${this.formatCurrency(this.invoice.totalAmount - this.amountPaid)}`;

    const newStatusHistory = {
      status: paymentStatusText,
      timestamp: Timestamp.now(),
      updatedBy: this.adminName || 'system',
      notes: paymentNotes
    };

    bookingUpdate.statusHistory = [...(this.booking.statusHistory || []), newStatusHistory];

    bookingUpdate.timestamps = {
      ...this.booking.timestamps,
      ...(isFullPayment && { completedAt: Timestamp.now() }),
      paymentProcessedAt: Timestamp.now()
    };

    await updateDoc(doc(this.firestore, 'service_bookings', this.booking.id), bookingUpdate);

    // Set receipt data for display
    this.receiptData = receipt;
    this.receiptGenerated = true;
    this.mode = 'view-receipt';

    await this.loadBookingAndInvoice();

    const message = isFullPayment 
      ? 'Payment processed successfully! Receipt generated.' 
      : `Partial payment of ${this.formatCurrency(this.amountPaid)} processed. Balance due: ${this.formatCurrency(this.invoice.totalAmount - this.amountPaid)}`;
    
    alert(message);
  } catch (error) {
    console.error('Error processing payment:', error);
    alert('Failed to process payment. Please try again.');
  }
}
  getReceiptLabourItems(): any[] {
    if (!this.receiptData) return [];

    const labourItems: any[] = [];

    // Booked services labour 
    if (this.receiptData.bookedServices && Array.isArray(this.receiptData.bookedServices)) {
      this.receiptData.bookedServices.forEach((service: any) => {
        const labourPrice = service.labourPrice || service.price || 0;
        labourItems.push({
          description: service.serviceName || service.name || 'Service Labour',
          quantity: service.quantity || 1,
          unitPrice: labourPrice,
          amount: labourPrice * (service.quantity || 1)
        });
      });
    }

    // Package services labour 
    if (this.receiptData.packageServices && Array.isArray(this.receiptData.packageServices)) {
      this.receiptData.packageServices.forEach((pkg: any) => {
        const labourPrice = pkg.labour.unitPrice || 0;
        if (labourPrice > 0) {
          labourItems.push({
            description: pkg.packageName || pkg.name || 'Package Service',
            quantity: 1,
            unitPrice: pkg.labour.unitPrice || 0,
            amount: pkg.labour.amount || 0
          });
        }
      });
    }

    // Additional services labour
    if (this.receiptData.additionalServices && Array.isArray(this.receiptData.additionalServices)) {
      this.receiptData.additionalServices.forEach((service: any) => {
        const servicePrice = service.unitPrice || service.serviceLabour.unitPrice || 0;
        if (servicePrice > 0) {
          labourItems.push({
            description: service.serviceName || service.name || 'Additional Service',
            quantity: service.serviceLabour.quantity || 1,
            unitPrice: service.serviceLabour.unitPrice || 0,
            amount: servicePrice * (service.serviceLabour.quantity || 1)
          });
        }
      });
    }

    console.log('Labour Items:', labourItems);
    return labourItems;
  }

  getReceiptPartsItems(): any[] {
    if (!this.receiptData) return [];

    const partsItems: any[] = [];

    // Parts from booked services
    if (this.receiptData.bookedServices && Array.isArray(this.receiptData.bookedServices)) {
      this.receiptData.bookedServices.forEach((service: any) => {
        if (service.parts && Array.isArray(service.parts)) {
          service.parts.forEach((part: any) => {
            const quantity = part.quantity || 1;
            const unitPrice = part.unitPrice || part.price || part.partPrice || 0;
            const amount = part.totalPrice || (quantity * unitPrice);

            if (amount > 0) {
              partsItems.push({
                description: part.partName || part.name || 'Part',
                quantity: quantity,
                unitPrice: unitPrice,
                amount: amount
              });
            }
          });
        }
      });
    }

    // Parts from additional services
    // if (this.receiptData.additionalServices && Array.isArray(this.receiptData.additionalServices)) {
    //   this.receiptData.additionalServices.forEach((service: any) => {
    //     if (service.parts && Array.isArray(service.parts)) {
    //       service.parts.forEach((part: any) => {
    //         const quantity = part.quantity || 1;
    //         const unitPrice = part.unitPrice || part.price || part.partPrice || 0;
    //         const amount = part.totalPrice || (quantity * unitPrice);

    //         if (amount > 0) {
    //           partsItems.push({
    //             description: part.partName || part.name || 'Part',
    //             quantity: quantity,
    //             unitPrice: unitPrice,
    //             amount: amount
    //           });
    //         }
    //       });
    //     }
    //   });
    // }
    
    // Package services labour 
    if (this.receiptData.packageServices && Array.isArray(this.receiptData.packageServices)) {
      this.receiptData.packageServices.forEach((pkg: any) => {
        const partsPrice = pkg.parts.unitPrice || 0;
        if (partsPrice > 0) {
          partsItems.push({
            description: pkg.packageName || pkg.name || 'Package Service',
            quantity: 1,
            unitPrice: pkg.parts.unitPrice || 0,
            amount: pkg.parts.amount || 0
          });
        }
      });
    }

    // Standalone parts
    if (this.receiptData.standaloneParts && Array.isArray(this.receiptData.standaloneParts)) {
      this.receiptData.standaloneParts.forEach((part: any) => {
        const quantity = part.quantity || 1;
        const unitPrice = part.unitPrice || part.price || 0;
        const amount = part.totalPrice || (quantity * unitPrice);

        if (amount > 0) {
          partsItems.push({
            description: part.name || 'Part',
            quantity: quantity,
            unitPrice: unitPrice,
            amount: amount
          });
        }
      });
    }

    return partsItems;
  }

  hasReceiptParts(): boolean {
    return this.getReceiptPartsItems().length > 0;
  }

  getPaymentMethodDisplay(method: string): string {
    const methodDisplay: { [key: string]: string } = {
      'cash': 'Cash',
      'card': 'Credit/Debit Card',
      'ewallet': 'E-Wallet',
      'bank_transfer': 'Bank Transfer',
      'pending': 'Pending'
    };
    return methodDisplay[method] || method;
  }

  getPaymentStatusDisplay(status: string): string {
    const statusDisplay: { [key: string]: string } = {
      'paid': 'Paid',
      'unpaid': 'Unpaid',
      'refunded': 'Refunded',
      'partial': 'Pending',

    };
    return statusDisplay[status] || status;
  }

  // Utility Methods
  generateTransactionId(): string {
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 10000);
    return `TXN-${timestamp}-${random}`;
  }

  formatWarrantyText(text: string): string {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
  }

   formatWarrantyEndDate(warrantyDays: number): string {
    const endDate = this.calculateWarrantyEndDate(warrantyDays);
    if (!endDate) return 'No warranty';

    return endDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  calculateWarrantyEndDate(warrantyDays: number): Date | null {
    if (!warrantyDays || warrantyDays <= 0) return null;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + warrantyDays);
    return endDate;
  }

  formatOperatingHours(operatingHours: any[]): string {
    if (!operatingHours || !Array.isArray(operatingHours)) {
      return 'N/A';
    }

    const daysMap: { [key: string]: string } = {
      'Monday': 'Mon',
      'Tuesday': 'Tue',
      'Wednesday': 'Wed',
      'Thursday': 'Thu',
      'Friday': 'Fri',
      'Saturday': 'Sat',
      'Sunday': 'Sun'
    };

    // Group consecutive days with same hours
    const groups = [];
    let currentGroup: any = null;

    for (const day of operatingHours) {
      const dayAbbr = daysMap[day.day] || day.day.substring(0, 3);

      if (day.isClosed) {
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({ days: [dayAbbr], hours: 'Closed' });
      } else {
        const hours = `${day.open} - ${day.close}`;

        if (currentGroup && currentGroup.hours === hours) {
          currentGroup.days.push(dayAbbr);
        } else {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { days: [dayAbbr], hours: hours };
        }
      }
    }

    if (currentGroup) groups.push(currentGroup);

    // Format the groups
    return groups.map(group => {
      if (group.days.length === 1) {
        return `${group.days[0]}: ${group.hours}`;
      } else {
        return `${group.days[0]}-${group.days[group.days.length - 1]}: ${group.hours}`;
      }
    }).join(', ');
  }

  formatCurrency(amount: number): string {
    if (!amount && amount !== 0) return 'RM0.00';
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount);
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
    return jsDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDateTime(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
    return jsDate.toLocaleString('en-MY', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  formatTime(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
    return jsDate.toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  // Helper method to get total services count
  getTotalServices(): number {
    if (!this.receiptData) return 0;

    const bookedServices = this.receiptData.bookedServices?.length || 0;
    const packageServices = this.receiptData.packageServices?.length || 0;
    const additionalServices = this.receiptData.additionalServices?.length || 0;

    return bookedServices + packageServices + additionalServices;
  }

  // Helper method to get total parts count
  getTotalParts(): number {
    if (!this.receiptData) return 0;

    let totalParts = 0;

    // Parts from booked services
    if (this.receiptData.bookedServices) {
      this.receiptData.bookedServices.forEach((service: any) => {
        totalParts += service.parts?.length || 0;
      });
    }

    // Parts from additional services
    if (this.receiptData.additionalServices) {
      this.receiptData.additionalServices.forEach((service: any) => {
        totalParts += service.parts?.length || 0;
      });
    }

    // Standalone parts
    totalParts += this.receiptData.standaloneParts?.length || 0;

    return totalParts;
  }

  printReceipt() {
    window.print();
  }
}