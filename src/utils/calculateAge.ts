export const calculateAge = (dateOfBirth: Date): number => {
  const diff = Date.now() - dateOfBirth.getTime();
  const ageDate = new Date(diff);

  return Math.abs(ageDate.getUTCFullYear() - 1970);
};
