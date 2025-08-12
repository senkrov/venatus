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
    x_position: 0,
    y_position: 0,
    current_world: 'nexus',
    gear_data: JSON.stringify(defaultGear),
  };
}

module.exports = {
  createDefaultUser,
};


