const { currentContact, fetchNextContact, submitDisposition } = useCallQueue();

// When screen loads, or user clicks "Next"
<button onClick={fetchNextContact}>Get Next Contact</button>

// When contact is loaded
{currentContact && (
  <>
    <h2>{currentContact.first_name} {currentContact.last_name}</h2>
    <a href={`tel:${currentContact.phone_number}`} className="call-button">Call Now</a>
    
    <select onChange={(e) => setDisposition(e.target.value)}>
      <option value="completed">Answered</option>
      <option value="no_answer">No Answer</option>
    </select>

    <button onClick={() => submitDisposition(currentContact.id, disposition, notes)}>
      Submit & Finish
    </button>
  </>
)}