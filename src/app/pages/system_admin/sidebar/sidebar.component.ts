import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  expanded: { [key: string]: boolean } = {};

  navItems = [
    { label: 'Dashboard', route: 'dashboard', icon: 'bi bi-speedometer2' },

    {
      label: 'Validate Account', icon: 'bi bi-person-check',
      children: [
        { label: 'Car Owner Account', route: 'validate-user-accounts' },
        {
          label: 'Car Repair Service Center', icon: 'bi bi-tools',
          children: [
            { label: 'Admin Account', route: 'validate-workshop-admin' },
            { label: 'Staff Account', route: 'validate-workshop-staff' },
            { label: 'Towing Driver Account', route: 'validate-towing-driver' }
          ]
        }
      ]
    },

    { label: 'Verify Vehicles', route: 'verify-vehicles', icon: 'bi bi-car-front' },
    { label: 'User Reviews', route: 'manage-review', icon: 'bi bi-chat-left-text' },
    { label: 'Manage Services', route: 'manage-services', icon: 'bi bi-gear' },
    { label: 'Manage Payments', route: 'manage-payment', icon: 'bi bi-cash-coin' },
    { label: 'Chat Support', route: 'manage-chat', icon: 'bi bi-chat-dots' },
    { label: 'Logout', route: 'logout', icon: 'bi bi-box-arrow-right' }
  ];

  toggleExpand(item: string) {
    this.expanded[item] = !this.expanded[item];
  }

}
