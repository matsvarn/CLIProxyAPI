# Accounts cooldown recovery

Mats reported: "where tf do i find that in my ui?" The screenshot showed the Accounts list with both Claude accounts needing attention and no cooldown recovery action.

The Accounts redesign retained the cooldown component and reset handler but stopped rendering them. Restore a labelled "Clear cooldown" button on each affected account row. Show the server's cooldown details below that row in an expandable section. Keep the existing list, confirmation, connection guards, and notifications.

This corrects recovery within the existing Accounts layout. It does not change the product's visual direction.
