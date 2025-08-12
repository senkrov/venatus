function createDefaultUser(username) {
  // Start with 4 inventory slots; capacity increases when a backpack is equipped
  const defaultGear = {
    inventory: [null, { id: 'item_pistol_a' }, null, null],
    hotbar: [{ id: 'item_pistol_a' }, null, null, null],
    equipment: {
      head: null,
      chest: null,
      boots: null,
      shoulderLeft: null,
      shoulderRight: null,
      backpack: null,
    },
  };

  return {
    username,
    x_position: 0, // Center of nexus realm
    y_position: 0, // Center of nexus realm
    current_realm: 'nexus',
    gear_data: JSON.stringify(defaultGear),
  };
}

module.exports = {
  createDefaultUser,
};


